use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use tauri_plugin_updater::Update;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::error::AppError;

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

/// Whether a download may start.
///
/// Pure: no app handle and no lock, so every refusal path is asserted by a test
/// instead of read out of the code.
pub fn download_gate(supported: bool, downloading: bool) -> Result<(), AppError> {
    if !supported {
        return Err(AppError::new(
            "update.unsupported",
            "Updates are published for Windows only",
        ));
    }
    if downloading {
        return Err(AppError::new(
            "update.busy",
            "An update download is already running",
        ));
    }
    Ok(())
}

/// Whether the downloaded update may be installed.
///
/// The order is the priority: platform first, then the running scan, then
/// whether anything was downloaded. Installing is an abrupt exit, so a scan in
/// flight would lose that pass.
pub fn install_gate(supported: bool, scanning: bool, ready: bool) -> Result<(), AppError> {
    if !supported {
        return Err(AppError::new(
            "update.unsupported",
            "Updates are published for Windows only",
        ));
    }
    if scanning {
        return Err(AppError::new(
            "update.blocked.scanning",
            "A scan is running",
        ));
    }
    if !ready {
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
    downloading: bool,
}

/// Whether a newly offered release is the one already pending. A different
/// version means a downloaded installer no longer answers the question.
pub(super) fn is_same_offer(pending: Option<&str>, offered: &str) -> bool {
    pending == Some(offered)
}

#[derive(Default)]
pub struct UpdateControl {
    state: Mutex<State>,
}

impl UpdateControl {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// Records the release currently being offered. An installer downloaded for
    /// a different version is dropped: those bytes no longer answer the
    /// question being asked.
    pub fn remember(&self, update: Update) {
        let mut state = self.lock();
        let pending = state
            .pending
            .as_ref()
            .map(|pending| pending.version.as_str());
        if !is_same_offer(pending, &update.version) {
            state.installer = None;
        }
        state.pending = Some(update);
    }

    pub fn pending(&self) -> Result<Update, AppError> {
        self.lock()
            .pending
            .clone()
            .ok_or_else(|| AppError::new("update.not_downloaded", "No update is pending"))
    }

    pub fn is_downloading(&self) -> bool {
        self.lock().downloading
    }

    pub fn begin_download(&self) -> Result<(), AppError> {
        let mut state = self.lock();
        if state.downloading {
            return Err(AppError::new(
                "update.busy",
                "An update download is already running",
            ));
        }
        state.downloading = true;
        Ok(())
    }

    pub fn finish_download(&self, bytes: Vec<u8>) {
        let mut state = self.lock();
        state.downloading = false;
        state.installer = Some(bytes);
    }

    pub fn fail_download(&self) {
        self.lock().downloading = false;
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
