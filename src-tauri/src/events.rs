// Only the test double below needs this: an `AppError`'s params are a map, and
// that is the shape a plugin failure is read back as.
#[cfg(test)]
use std::collections::BTreeMap;

use crate::error::AppError;
use crate::scan::control::ScanStatus;
use crate::update::UpdateProgress;
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
///
/// `Send + Sync` because one holder of it is not a command: the plugin host
/// keeps it and reports from whichever thread made the call
/// (`crate::plugins::PluginHost`).
pub trait Events: Send + Sync {
    fn scan_progress(&self, status: ScanStatus);
    fn library_changed(&self);
    fn media_error(&self, error: &AppError);
    /// The window was asked to close while a 共享服务 is running, and is being
    /// held while the user is asked about it (`crate::closing`).
    ///
    /// Carries nothing: what is being asked is a question the interface already
    /// has the words for, and what would be closed is the window it is drawn in.
    fn close_requested(&self);
    /// Whether the window is maximized, which is the whole of what the picture
    /// on the titlebar's middle button is drawn from.
    ///
    /// Sent on the change rather than on every measurement, because the
    /// measurement is the window's own resize event and that arrives on every
    /// frame of a drag (`crate::titlebar`).
    fn window_maximized(&self, maximized: bool);
    /// Where a download has got to. How it ended is not here: that is the
    /// answer the command returns, because the section has to settle on exactly
    /// one of "ready", "paused" or "cancelled" and an event is not a race it
    /// should have to win.
    ///
    /// The numbers are here rather than sent from the transfer because a
    /// progress bar is the one thing the user watches while nothing else on the
    /// page moves: a download that reported nothing, or reported numbers that
    /// never changed, would be indistinguishable from one that had stopped, and
    /// the only way to tell was to open the window and look. Through this, a
    /// test reads the same numbers the interface does.
    fn update_progress(&self, progress: UpdateProgress);
    /// A plugin failed at a mount point, and the kernel went on without it.
    ///
    /// The failure travels as an `AppError` like every other one, so the words
    /// the user reads are written from a code and its params and are translated
    /// with the rest of the interface: `plugin` and `mountPoint` are the two
    /// facts the message names, and `errorId` is what the log line for the same
    /// failure is found by (spec #82, story 39).
    ///
    /// One notification per failed call, and no more: the host stops asking a
    /// plugin that has failed five times, because a plugin that fails on every
    /// render would otherwise leave the user no way to do anything else
    /// (ADR 0043 §5).
    ///
    /// Nothing sends this yet: its one caller is the plugin host, and the host
    /// is not reached from the kernel until the commands that mount to it land
    /// (#86, #88). The method is written down and implemented here so that the
    /// notification a failure produces is part of the host's rules from the
    /// first day rather than something bolted on with the wiring.
    #[allow(dead_code)]
    fn plugin_failed(&self, error: &AppError);
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

    fn close_requested(&self) {
        let _ = self.0.emit("close-requested", ());
    }

    fn window_maximized(&self, maximized: bool) {
        let _ = self.0.emit("window-maximized", maximized);
    }

    fn update_progress(&self, progress: UpdateProgress) {
        let _ = self.0.emit("update-progress", progress);
    }

    fn plugin_failed(&self, error: &AppError) {
        let _ = self.0.emit("plugin-failed", error);
    }
}

/// What a test sees instead of a window: the events in the order they were
/// sent, as the values the sender handed over.
///
/// It records codes rather than whole `AppError`s because the error carries a
/// generated id and is not cloneable — a test asserting on the code is
/// asserting on the part that is a rule.
#[cfg(test)]
type StatusHook = Box<dyn FnMut(&ScanStatus) + Send>;

#[cfg(test)]
#[derive(Default)]
pub struct Recorded {
    pub scan: std::sync::Mutex<Vec<ScanStatus>>,
    pub library_changes: std::sync::atomic::AtomicUsize,
    pub media_errors: std::sync::Mutex<Vec<String>>,
    /// Every progress report a download sent, in order.
    pub downloads: std::sync::Mutex<Vec<UpdateProgress>>,
    /// How many times the interface was told a close is being held for it.
    pub close_requests: std::sync::atomic::AtomicUsize,
    /// Every maximized state the interface was told, in order. The order is
    /// the point rather than the tally: what the titlebar is being kept from
    /// doing is repeating itself, and a count would not say whether the last
    /// thing said is the thing that is true.
    pub maximized: std::sync::Mutex<Vec<bool>>,
    /// Every plugin failure the interface was told.
    ///
    /// Codes and params rather than whole errors, for the reason the media
    /// errors are codes: an `AppError` carries a generated id and is not
    /// cloneable. What a test asserts on is the part that is a rule — which
    /// plugin, at which mount point — and the params are exactly that part.
    pub plugin_failures: std::sync::Mutex<Vec<(String, BTreeMap<String, String>)>>,
    /// Runs as each status goes out, before it is written down.
    ///
    /// Some rules can only be exercised from inside the pass that has them:
    /// cancelling one halfway, or noticing whether a file was reached at all.
    /// No value read after the pass could do either.
    on_status: std::sync::Mutex<Option<StatusHook>>,
}

#[cfg(test)]
impl Recorded {
    /// Watches statuses as they go out.
    pub fn watching(self, hook: impl FnMut(&ScanStatus) + Send + 'static) -> Self {
        *self.on_status.lock().unwrap() = Some(Box::new(hook));
        self
    }

    pub fn statuses(&self) -> Vec<ScanStatus> {
        self.scan.lock().unwrap().clone()
    }

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

    /// What a download said while it ran.
    pub fn updates(&self) -> Vec<UpdateProgress> {
        self.downloads.lock().unwrap().clone()
    }

    /// How many times the interface was told a close is being held.
    pub fn close_requests(&self) -> usize {
        self.close_requests
            .load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Every maximized state the interface was told, in order.
    pub fn maximized(&self) -> Vec<bool> {
        self.maximized.lock().unwrap().clone()
    }

    /// Every plugin failure the interface was told, as the three facts the
    /// message is written from.
    pub fn plugin_failures(&self) -> Vec<PluginFailure> {
        self.plugin_failures
            .lock()
            .unwrap()
            .iter()
            .map(|(code, params)| PluginFailure {
                code: code.clone(),
                plugin: params.get("plugin").cloned().unwrap_or_default(),
                mount_point: params.get("mountPoint").cloned().unwrap_or_default(),
            })
            .collect()
    }
}

/// One plugin failure as a test reads it back: the code the message is
/// translated from, and the two names it carries.
#[cfg(test)]
#[derive(Clone, Debug)]
pub struct PluginFailure {
    pub code: String,
    pub plugin: String,
    pub mount_point: String,
}

#[cfg(test)]
impl Events for Recorded {
    fn scan_progress(&self, status: ScanStatus) {
        if let Some(hook) = self.on_status.lock().unwrap().as_mut() {
            hook(&status);
        }
        self.scan.lock().unwrap().push(status);
    }

    fn library_changed(&self) {
        self.library_changes
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    fn media_error(&self, error: &AppError) {
        self.media_errors.lock().unwrap().push(error.code.clone());
    }

    fn update_progress(&self, progress: UpdateProgress) {
        self.downloads.lock().unwrap().push(progress);
    }

    fn close_requested(&self) {
        self.close_requests
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    fn window_maximized(&self, maximized: bool) {
        self.maximized.lock().unwrap().push(maximized);
    }

    fn plugin_failed(&self, error: &AppError) {
        self.plugin_failures
            .lock()
            .unwrap()
            .push((error.code.clone(), error.params.clone()));
    }
}
