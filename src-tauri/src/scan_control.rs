use serde::Serialize;
use std::sync::{Arc, Condvar, Mutex};

use crate::error::AppError;
use crate::repository::IndexChanges;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub background: bool,
    pub phase: String,
    pub changes: IndexChanges,
    pub failures: usize,
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
    use super::{ScanControl, ScanStatus};
    use std::sync::Arc;

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
