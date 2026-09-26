use serde::Serialize;
use std::sync::{Arc, Condvar, Mutex};

use crate::error::AppError;
use crate::repository::IndexChanges;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub operation: String,
    pub background: bool,
    pub phase: String,
    pub changes: IndexChanges,
    pub failures: usize,
    /// Configured directories this run could not read at all. Counted apart
    /// from `failures`: it is a fact about the scan universe, not a media
    /// failure, and it must not extend the completion notice's stay.
    pub unreachable_directories: usize,
    pub discovered: usize,
    pub processed: usize,
    pub indexed: usize,
    pub metadata_ready: usize,
    pub thumbnails_ready: usize,
    pub current_path: String,
}

#[derive(Default)]
struct State {
    running: bool,
    paused: bool,
    cancelled: bool,
    status: ScanStatus,
}

#[derive(Default)]
pub struct ScanControl {
    state: Mutex<State>,
    changed: Condvar,
}

pub struct ScanGuard(Arc<ScanControl>);

impl ScanControl {
    pub fn is_cancelled(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .cancelled
    }
    pub fn is_running(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .running
    }

    pub fn begin(self: &Arc<Self>) -> Result<ScanGuard, AppError> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state.running {
            return Err(AppError::new(
                "media.scan.busy",
                "A scan is already running",
            ));
        }
        *state = State {
            running: true,
            status: ScanStatus {
                phase: "discovering".into(),
                operation: "scan".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        Ok(ScanGuard(Arc::clone(self)))
    }

    pub fn checkpoint(&self) -> Result<(), AppError> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        while state.paused && !state.cancelled {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(|error| error.into_inner());
        }
        if state.cancelled {
            return Err(AppError::new("media.scan.cancelled", "Scan cancelled"));
        }
        Ok(())
    }

    pub fn action(&self, action: &str) -> Result<(), AppError> {
        if !["pause", "resume", "cancel"].contains(&action) {
            return Err(AppError::new(
                "media.scan.invalid_action",
                "Unknown scan action",
            ));
        }
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if !state.running {
            return Ok(());
        }
        match action {
            "pause" => state.paused = true,
            "resume" => state.paused = false,
            "cancel" => {
                state.cancelled = true;
                state.paused = false;
            }
            _ => unreachable!(),
        }
        self.changed.notify_all();
        Ok(())
    }

    pub fn publish(&self, status: ScanStatus) {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .status = status;
    }

    pub fn status(&self) -> ScanStatus {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let mut status = state.status.clone();
        if state.paused {
            status.phase = "paused".into();
        }
        status
    }
}

/// What a change to the spaces answers while a media task holds the slot.
///
/// The slot is held by a scan, by a scan that is paused, and by the information
/// refresh of a single file, which asks for it the same way. Asking the slot
/// rather than reading a phase is what makes those three the same question --
/// one gate describing one thing, which is what ADR 0012 asks for.
///
/// The refusal is not about a race: a task carries the space it was started on
/// and writes where it meant to. It is that progress is reported for the
/// application and names no space, so a user who moved away in the middle of a
/// pass would be watching one that is not touching the library in front of them.
pub fn space_change_gate(scanning: bool) -> Result<(), AppError> {
    if scanning {
        return Err(AppError::new(
            "space.blocked.scanning",
            "A media task is holding the scan slot",
        ));
    }
    Ok(())
}

impl Drop for ScanGuard {
    fn drop(&mut self) {
        let mut state = self
            .0
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        state.running = false;
        state.paused = false;
        if state.cancelled {
            state.status.phase = "cancelled".into();
        } else if state.status.phase != "complete" {
            state.status.phase = "failed".into();
        }
        self.0.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::{space_change_gate, ScanControl, ScanStatus};
    use std::sync::Arc;

    #[test]
    fn the_spaces_cannot_change_while_the_slot_is_held() {
        let control = Arc::new(ScanControl::default());
        // Nothing is running, so nothing is in the way.
        assert!(space_change_gate(control.is_running()).is_ok());
        // `begin` is how a pass takes the slot, and the information refresh of
        // a single file takes it the same way, so this covers both of them.
        let guard = control.begin().unwrap();
        assert_eq!(
            space_change_gate(control.is_running())
                .unwrap_err()
                .code,
            "space.blocked.scanning"
        );
        // A paused pass is still a pass: the slot is held and its progress is
        // still what the interface would be showing.
        control.action("pause").unwrap();
        assert_eq!(control.status().phase, "paused");
        assert!(space_change_gate(control.is_running()).is_err());
        // Cancelling asks the pass to stop rather than stopping it, so the slot
        // is still held here; it comes back when the pass itself ends.
        control.action("cancel").unwrap();
        assert!(space_change_gate(control.is_running()).is_err());
        drop(guard);
        assert!(space_change_gate(control.is_running()).is_ok());
    }

    #[test]
    fn concurrent_scans_are_rejected_and_cancellation_releases_slot() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        assert!(control.begin().is_err());
        control.action("pause").unwrap();
        assert_eq!(control.status().phase, "paused");
        control.action("cancel").unwrap();
        assert_eq!(
            control.checkpoint().unwrap_err().code,
            "media.scan.cancelled"
        );
        drop(guard);
        assert_eq!(control.status().phase, "cancelled");
        let next = control.begin().unwrap();
        control.checkpoint().unwrap();
        control.publish(ScanStatus {
            phase: "complete".into(),
            ..Default::default()
        });
        drop(next);
        assert_eq!(control.status().phase, "complete");
    }
}
