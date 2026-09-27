use crate::error::AppError;
use crate::scan::control::ScanStatus;
use tauri::{AppHandle, Emitter};

/// Everything the backend tells the interface, one method per event.
///
/// The event names were string literals at every call site, and the handle that
/// sends them cannot be built in a test — so no test could assert that a rescan
/// told the interface the library had changed, or that a media failure reached
/// it as an error rather than only as a count. Handing the commands this
/// instead of the handle is what puts the events on the same seam as the
/// repository and the media tools: a value a test can make, not one only Tauri
/// can make.
///
/// One method per event rather than a generic `emit(name, payload)` on purpose:
/// the generic form erases the payload to JSON at the seam, so a test would be
/// asserting on the shape it just serialised, and a typo in an event name would
/// stop being a compile error.
pub trait Events {
    fn scan_progress(&self, status: ScanStatus);
    fn library_changed(&self);
    fn media_error(&self, error: &AppError);
}

/// The application's own interface, over Tauri's emitter.
pub struct AppEvents(pub AppHandle);

impl Events for AppEvents {
    fn scan_progress(&self, status: ScanStatus) {
        let _ = self.0.emit("scan-progress", status);
    }

    fn library_changed(&self) {
        let _ = self.0.emit("library-changed", ());
    }

    fn media_error(&self, error: &AppError) {
        let _ = self.0.emit("media-error", error);
    }
}

/// What a test sees instead of a window: the events in the order they were
/// sent, as the values the sender handed over.
///
/// It records codes rather than whole `AppError`s because the error carries a
/// generated id and is not cloneable — a test asserting on the code is
/// asserting on the part that is a rule.
#[cfg(test)]
#[derive(Default)]
pub struct Recorded {
    pub scan: std::sync::Mutex<Vec<ScanStatus>>,
    pub library_changes: std::sync::atomic::AtomicUsize,
    pub media_errors: std::sync::Mutex<Vec<String>>,
}

#[cfg(test)]
impl Recorded {
    pub fn scan_phases(&self) -> Vec<String> {
        self.scan
            .lock()
            .unwrap()
            .iter()
            .map(|status| status.phase.clone())
            .collect()
    }

    pub fn library_changes(&self) -> usize {
        self.library_changes
            .load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn media_error_codes(&self) -> Vec<String> {
        self.media_errors.lock().unwrap().clone()
    }
}

#[cfg(test)]
impl Events for Recorded {
    fn scan_progress(&self, status: ScanStatus) {
        self.scan.lock().unwrap().push(status);
    }

    fn library_changed(&self) {
        self.library_changes
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    fn media_error(&self, error: &AppError) {
        self.media_errors.lock().unwrap().push(error.code.clone());
    }
}
