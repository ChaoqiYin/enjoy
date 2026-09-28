use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Notify;

use crate::error::AppError;
use crate::scan::control::ScanControl;

use super::release::Release;

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

/// The bytes and the release they belong to, when both are here.
///
/// One statement of what "ready" means, shared by the question the interface
/// asks (`ready_version`) and the one the install path asks. Bytes alone are not
/// ready: an installer whose release is gone no longer answers anything.
fn installable(state: &State) -> Option<(&dyn Release, &Vec<u8>)> {
    match (state.pending.as_deref(), state.installer.as_ref()) {
        (Some(release), Some(bytes)) => Some((release, bytes)),
        _ => None,
    }
}

#[derive(Default)]
struct State {
    /// The release the user was asked about. Keeping it means the transfer does
    /// not check again: the offer the user accepted is the one downloaded and
    /// installed.
    pending: Option<Arc<dyn Release>>,
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
    /// a different version is dropped: those bytes no longer answer the question
    /// being asked, and neither do half of them.
    ///
    /// Both halves of that are one statement here rather than a rule that names
    /// a release and a helper beside it that compares versions — the version a
    /// release answers with is the release's own now, so the rule can be written
    /// where it acts and a test can bring a release to it. The bytes it drops
    /// are the ones a user waited for, which is what made leaving it unwatched
    /// the worst of the gaps.
    pub fn remember(&self, release: Arc<dyn Release>) {
        let mut state = self.lock();
        let same = state
            .pending
            .as_ref()
            .map(|pending| pending.version())
            .is_some_and(|pending| pending == release.version());
        if !same {
            state.installer = None;
            state.partial = None;
        }
        state.pending = Some(release);
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

    pub fn pending(&self) -> Result<Arc<dyn Release>, AppError> {
        self.lock()
            .pending
            .clone()
            .ok_or_else(|| AppError::new("update.not_downloaded", "No update is pending"))
    }

    pub fn ready_version(&self) -> Option<String> {
        installable(&self.lock()).map(|(release, _)| release.version().to_string())
    }

    /// Whether the update may be installed, with the release and the installer
    /// when it may.
    ///
    /// The three questions are asked in the order the interface reports them —
    /// platform, then the running scan, then whether anything was downloaded —
    /// and all of them are asked here rather than by a caller that gathers the
    /// facts first. Gathering them outside put the rule in one place and its
    /// inputs in another, and left the gap between the two: the scan was read,
    /// the read released, and the installer taken afterwards, so a scan starting
    /// in between was installed over. That is exactly what this gate is for —
    /// installing hands the update to the platform installer and exits, so a
    /// pass in flight loses that work.
    ///
    /// The slot is therefore read twice. The first read only fixes which refusal
    /// is reported, because the download is asked in between and a refusal must
    /// not spend the closing; the second one closes the slot, and from there no
    /// scan can begin. Closing is asked last, once every other question has
    /// passed, so a refusal leaves the application able to scan.
    ///
    /// Locks: the update lock is held, and the scan lock is taken inside it. No
    /// path may take them the other way round.
    pub fn install(
        &self,
        scan: &ScanControl,
        supported: bool,
    ) -> Result<(Arc<dyn Release>, Vec<u8>), AppError> {
        let mut state = self.lock();
        if !supported {
            return Err(AppError::new(
                "update.unsupported",
                "Updates are published for Windows only",
            ));
        }
        if scan.is_running() {
            return Err(AppError::new(
                "update.blocked.scanning",
                "A scan is running",
            ));
        }
        if installable(&state).is_none() {
            return Err(AppError::new(
                "update.not_downloaded",
                "No downloaded update",
            ));
        }
        if !scan.close() {
            return Err(AppError::new(
                "update.blocked.scanning",
                "A scan started while this was being asked",
            ));
        }
        // Present under this lock, and the slot closing cannot change that: the
        // two questions above are the only way this can fail.
        let release = state.pending.take().expect("installable, under this lock");
        let bytes = state
            .installer
            .take()
            .expect("installable, under this lock");
        Ok((release, bytes))
    }
}
