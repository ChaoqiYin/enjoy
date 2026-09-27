use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use tauri_plugin_updater::Update;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::sync::Notify;

use crate::app::AppState;
use crate::error::AppError;

/// What a running download has been asked to do.
///
/// These are requests rather than actions: only the transfer loop can end a
/// transfer cleanly, so asking it is all a command can do.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Stop {
    /// Nothing asked: run until the payload is whole.
    Run,
    /// Stop, and keep what has arrived so a later attempt continues from it.
    Pause,
    /// Stop, and drop what has arrived.
    Cancel,
}

const RUN: u8 = 0;
const PAUSE: u8 = 1;
const CANCEL: u8 = 2;

impl Stop {
    fn bits(self) -> u8 {
        match self {
            Self::Run => RUN,
            Self::Pause => PAUSE,
            Self::Cancel => CANCEL,
        }
    }

    fn from_bits(bits: u8) -> Self {
        match bits {
            PAUSE => Self::Pause,
            CANCEL => Self::Cancel,
            _ => Self::Run,
        }
    }
}

/// What a transfer checks between chunks, and the way a command wakes one that
/// is waiting on a connection which has gone quiet.
///
/// An atomic rather than a field of the state mutex, because the transfer reads
/// it between every chunk and the mutex belongs to the commands; the
/// notification is what turns a stop into something felt within a moment rather
/// than at the next byte or the read timeout.
#[derive(Default)]
pub struct StopFlag {
    asked: AtomicU8,
    changed: Notify,
}

impl StopFlag {
    pub fn request(&self, stop: Stop) {
        self.asked.store(stop.bits(), Ordering::SeqCst);
        // One waiter, and the permit is kept if there is none: the transfer is
        // either reading, in which case it wakes, or between connections, in
        // which case it finds this before opening the next one.
        self.changed.notify_one();
    }

    pub fn requested(&self) -> Stop {
        Stop::from_bits(self.asked.load(Ordering::SeqCst))
    }

    pub fn clear(&self) {
        self.asked.store(RUN, Ordering::SeqCst);
    }

    /// Resolves once something has been asked for.
    pub async fn changed(&self) {
        self.changed.notified().await;
    }
}

/// Updates are published for Windows x86_64 only.
///
/// This is `cfg!` rather than `#[cfg]` on purpose. The module is compiled and
/// linted on every platform, so the Windows-only paths stay under the macOS
/// continuous integration run; gating them out would leave the code that only
/// ever executes on Windows unchecked until a release build.
pub fn is_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "x86_64"))
}

/// The release the user is being asked to install.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    /// RFC 3339, which is the one string form the frontend turns back into an
    /// instant; it then formats that for the current language. See
    /// [`published_at`] for why this is not simply the date's own rendering.
    pub date: Option<String>,
}

/// The single shape `check_for_update` returns, covering every outcome so the
/// settings section renders from one value.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub supported: bool,
    pub current_version: String,
    pub available: Option<AvailableUpdate>,
    /// The installer is downloaded and verified; only a restart is missing. It
    /// is remembered in the backend so leaving the settings page and coming
    /// back still shows it.
    pub ready_to_restart: bool,
}

/// Payload of the `update-progress` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub version: String,
}

/// The publish date in the form the frontend parses.
///
/// `Update::date` is a `time::OffsetDateTime`, and its own rendering is not RFC
/// 3339: it comes out as `2026-09-26 14:34:10.0 +00:00:00`. JavaScript's `Date`
/// reads none of that — an offset carrying seconds is enough to fail on its own
/// — so `to_string` would hand the frontend an unreadable date. Formatting the
/// instant here, where its type is known, is what keeps the string on the wire
/// the same shape the release manifest arrived in.
///
/// A date that cannot be written is dropped rather than sent in another form:
/// the frontend renders what it can read and leaves the line out otherwise, and
/// a release note without its date is worth more than a screen that fails to
/// draw. Only years outside RFC 3339's range can fail, which no release has.
pub(super) fn published_at(date: Option<OffsetDateTime>) -> Option<String> {
    date.and_then(|date| date.format(&Rfc3339).ok())
}

pub fn describe(update: &Update) -> AvailableUpdate {
    AvailableUpdate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: published_at(update.date),
    }
}

/// Decides which progress updates are worth sending to the webview.
///
/// A fast download fires hundreds of chunk callbacks; one event each would
/// flood the frontend over a difference nobody can see.
#[derive(Default)]
pub struct ProgressThrottle {
    reported: bool,
    last_step: u64,
}

/// Step used when the server does not report a content length.
const UNKNOWN_TOTAL_STEP: u64 = 1 << 20;

impl ProgressThrottle {
    pub fn should_emit(&mut self, downloaded: u64, total: Option<u64>) -> bool {
        let step = match total.filter(|total| *total > 0) {
            Some(total) => (downloaded.saturating_mul(100) / total).min(100),
            None => downloaded / UNKNOWN_TOTAL_STEP,
        };
        if self.reported && step == self.last_step {
            return false;
        }
        self.reported = true;
        self.last_step = step;
        true
    }
}

/// What the restart gate decides from.
///
/// It used to be a pure function over flags with the command gathering the flags
/// for itself. That put the rule in one place and its inputs in another: a
/// condition added to the gate could be left unsampled at the call site and
/// every test would stay green, because the tests asserted on combinations of
/// flags rather than on where the flags came from. They are gathered here
/// instead, which is also what makes the gathering testable — a test builds the
/// state rather than the flags.
///
/// A condition added to the gate therefore needs a field here, and a field here
/// has to be filled in by `now`; neither can be left undone without the compiler
/// saying so.
///
/// The download gate is not here: the fact it turns on — whether a download is
/// already running — is a fact about the slot, so it is asked under the slot's
/// own lock in [`UpdateControl::take_slot`] rather than sampled outside it.
pub struct World {
    pub supported: bool,
    pub scanning: bool,
    pub ready: bool,
}

impl World {
    /// The world as it is, for a command to gate on. The only place these are
    /// read.
    pub fn now(state: &AppState) -> Self {
        Self {
            supported: is_supported(),
            scanning: state.scan.is_running(),
            ready: state.update.ready_version().is_some(),
        }
    }
}

/// Whether the downloaded update may be installed.
///
/// The order is the priority: platform first, then the running scan, then
/// whether anything was downloaded. Installing is an abrupt exit, so a scan in
/// flight would lose that pass.
pub fn install_gate(world: &World) -> Result<(), AppError> {
    if !world.supported {
        return Err(AppError::new(
            "update.unsupported",
            "Updates are published for Windows only",
        ));
    }
    if world.scanning {
        return Err(AppError::new(
            "update.blocked.scanning",
            "A scan is running",
        ));
    }
    if !world.ready {
        return Err(AppError::new(
            "update.not_downloaded",
            "No downloaded update",
        ));
    }
    Ok(())
}

#[derive(Default)]
struct State {
    /// The release the user was asked about. Keeping it means `install_update`
    /// does not check again: the offer the user accepted is the one installed.
    pending: Option<Update>,
    /// Verified installer bytes held until the user restarts. The updater
    /// returns bytes rather than a path, so this is memory instead of an
    /// unsigned file on disk that would need cleaning up.
    installer: Option<Vec<u8>>,
    /// What a download that was paused had arrived at. Held so continuing asks
    /// for the rest rather than starting the whole transfer again, and dropped
    /// the moment it stops being what the user is being offered.
    partial: Option<Vec<u8>>,
    downloading: bool,
}

/// Whether a newly offered release is the one already pending. A different
/// version means a downloaded installer no longer answers the question.
pub(super) fn is_same_offer(pending: Option<&str>, offered: &str) -> bool {
    pending == Some(offered)
}

/// The one download the application may have in flight, held for the duration of
/// a transfer and consumed by its ending.
///
/// The transfer used to be a sequence of methods on the control — mark it
/// started, forget the last stop, take the bytes it will continue from, and then
/// at the end free the slot *and* park what arrived, in that order, with the
/// order written down only in comments. Reversing the last two drops the bytes
/// of a paused download, and nothing said so. Here the slot is taken in one call
/// and handed back in one call, so the two cannot come apart: every way a
/// transfer can end frees the slot and decides the bytes in the same lock.
///
/// What a transfer cannot do is end without saying how. There is no method that
/// frees the slot on its own, and `Slot` has no `Drop` that would quietly decide
/// for it — a transfer that returned early without one of the three endings
/// would leave the slot taken, which is visible immediately rather than a lost
/// download discovered later.
pub struct Slot<'a> {
    control: &'a UpdateControl,
    /// What a paused download had arrived at, taken from the slot when this was
    /// taken. It is this transfer's from here on.
    from: Vec<u8>,
}

impl Slot<'_> {
    /// The bytes to continue from. Empty when the last download brought nothing,
    /// which is the same thing as starting from the beginning.
    pub fn resume(&self) -> &[u8] {
        &self.from
    }

    /// The release arrived and its signature checked out: it is held for the
    /// restart, and the slot is free.
    pub fn install(self, bytes: Vec<u8>) {
        let mut state = self.control.lock();
        state.downloading = false;
        state.installer = Some(bytes);
    }

    /// The transfer stopped, and what it brought is worth continuing from: a
    /// pause the user asked for, or a connection that dropped. Kept rather than
    /// dropped, because a failure on the link this exists for is expected rather
    /// than exceptional, and starting from nothing each time is what would make
    /// a release of this size unreachable.
    pub fn keep(self, bytes: Vec<u8>) {
        let mut state = self.control.lock();
        state.downloading = false;
        // An empty payload is nothing to keep.
        state.partial = if bytes.is_empty() { None } else { Some(bytes) };
    }

    /// Nothing is kept. The bytes go here rather than being left for the next
    /// download, because they are only worth resuming if nobody said to throw
    /// them away.
    pub fn discard(self) {
        let mut state = self.control.lock();
        state.downloading = false;
        state.partial = None;
    }
}

#[derive(Default)]
pub struct UpdateControl {
    state: Mutex<State>,
    stop: StopFlag,
}

impl UpdateControl {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// Records the release currently being offered. An installer downloaded for
    /// a different version is dropped: those bytes no longer answer the
    /// question being asked, and neither do half of them.
    pub fn remember(&self, update: Update) {
        let mut state = self.lock();
        let pending = state
            .pending
            .as_ref()
            .map(|pending| pending.version.as_str());
        if !is_same_offer(pending, &update.version) {
            state.installer = None;
            state.partial = None;
        }
        state.pending = Some(update);
    }

    /// The cursor a transfer watches, so a running download can be stopped.
    pub fn flag(&self) -> &StopFlag {
        &self.stop
    }

    /// Takes the one download slot for a transfer, or says why it cannot be
    /// had. What comes back is that transfer's until it ends.
    ///
    /// Four things happen in one lock, because their order is the whole of what
    /// the caller used to have to remember: the gate is asked, the slot is
    /// marked taken, the stop flag is cleared — a stop asked for *before* this
    /// download started is not this one's business — and the bytes a paused
    /// download left are taken. Those bytes are this transfer's from here on,
    /// which is why the client has to be built before this is called: a machine
    /// that cannot build one would otherwise eat what the last transfer kept.
    pub fn take_slot(&self, supported: bool) -> Result<Slot<'_>, AppError> {
        let mut state = self.lock();
        // The download gate's two questions, asked under the lock rather than
        // by a predicate the caller consults first: whether a download is
        // already running is a fact about this slot, and a check outside the
        // lock is a check another download can pass between.
        if !supported {
            return Err(AppError::new(
                "update.unsupported",
                "Updates are published for Windows only",
            ));
        }
        if state.downloading {
            return Err(AppError::new(
                "update.busy",
                "An update download is already running",
            ));
        }
        state.downloading = true;
        let from = state.partial.take().unwrap_or_default();
        self.stop.clear();
        Ok(Slot {
            control: self,
            from,
        })
    }

    /// Asks a running download to pause or to stop, by the name the interface
    /// gives it.
    ///
    /// Continuing is deliberately not one of these. Continuing is a download
    /// started again from what was kept, and it needs everything starting one
    /// needs — the gate, the signature key, the progress reporting — so it is
    /// `install_update`, called a second time, rather than a second path here
    /// that would have to keep all of that in step.
    ///
    /// A cancel that arrives with nothing running is a paused download being
    /// dismissed, so it is answered here rather than refused: the bytes it was
    /// keeping are what has to go.
    pub fn action(&self, action: &str) -> Result<(), AppError> {
        let stop = match action {
            "pause" => Stop::Pause,
            "cancel" => Stop::Cancel,
            _ => {
                return Err(AppError::new(
                    "update.invalid_action",
                    "Unknown update action",
                ))
            }
        };
        let mut state = self.lock();
        if state.downloading {
            // Asked for under the lock, so a download cannot start between the
            // check and the request and be stopped by an action meant for the
            // one before it.
            self.stop.request(stop);
        } else if stop == Stop::Cancel {
            state.partial = None;
        }
        // A pause with nothing to pause asks for the state the download is
        // already in, so there is nothing to do and nothing to complain about.
        Ok(())
    }

    pub fn pending(&self) -> Result<Update, AppError> {
        self.lock()
            .pending
            .clone()
            .ok_or_else(|| AppError::new("update.not_downloaded", "No update is pending"))
    }

    pub fn ready_version(&self) -> Option<String> {
        let state = self.lock();
        match (state.installer.as_ref(), state.pending.as_ref()) {
            (Some(_), Some(pending)) => Some(pending.version.clone()),
            _ => None,
        }
    }

    pub fn take_installer(&self) -> Result<(Update, Vec<u8>), AppError> {
        let mut state = self.lock();
        match (state.pending.clone(), state.installer.take()) {
            (Some(update), Some(bytes)) => Ok((update, bytes)),
            _ => Err(AppError::new(
                "update.not_downloaded",
                "No downloaded update",
            )),
        }
    }
}
