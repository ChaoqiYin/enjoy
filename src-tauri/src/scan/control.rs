use serde::Serialize;
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

use crate::error::{AppError, SCAN_CANCELLED};
use crate::repository::IndexChanges;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub operation: String,
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
    /// Closed for the rest of the run by [`ScanControl::close`], which only the
    /// install path calls. It is not the same fact as `running`: this one is
    /// never given back.
    closed: bool,
    status: ScanStatus,
}

#[derive(Default)]
pub struct ScanControl {
    state: Mutex<State>,
    changed: Condvar,
}

impl State {
    /// What a reader sees right now.
    ///
    /// The pause overlay is applied here rather than at each reader, because
    /// there are two of them and they must not disagree. A paused pass keeps
    /// working, so it keeps writing the phase its work is in — `processing`,
    /// `thumbnails` — and the phase the user is shown while the pause is on is
    /// `paused` regardless. Written at both readers, that rule had two sources
    /// and "paused" was free to drift apart from itself.
    fn seen(&self) -> ScanStatus {
        let mut snapshot = self.status.clone();
        if self.paused {
            snapshot.phase = "paused".into();
        }
        snapshot
    }
}

pub struct ScanGuard(Arc<ScanControl>);

impl ScanControl {
    /// The scan lock, taken the way every method here takes it: a poisoned lock
    /// is one a panicking thread left behind, and what it left behind is still
    /// the state.
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }

    pub fn is_cancelled(&self) -> bool {
        self.lock().cancelled
    }

    pub fn is_running(&self) -> bool {
        self.lock().running
    }

    pub fn begin(self: &Arc<Self>) -> Result<ScanGuard, AppError> {
        let mut state = self.lock();
        if state.closed {
            // Only the install path closes the slot, and installing exits the
            // process. A scan asked for in the moment before that is not
            // queued: there is no later to run it in. Same code as a scan that
            // is already running — the interface has one thing to say about a
            // slot it cannot have.
            return Err(AppError::new(
                "media.scan.busy",
                "The scan slot is closed for the rest of this run",
            ));
        }
        if state.running {
            return Err(AppError::new(
                "media.scan.busy",
                "A scan is already running",
            ));
        }
        // Replaced wholesale, which is also what clears `cancelled` from the
        // pass before. `closed` cannot be lost here: the check above returns
        // before this is reached.
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

    /// Closes the slot for the rest of the run, or says that a task holds it.
    ///
    /// Installing an update exits the process, so what that path needs is not
    /// the slot held for a while but the slot closed for good. A guard that
    /// could be released would offer a way back that does not exist, and would
    /// leave the caller trusted not to take it.
    ///
    /// `false` rather than an error, because the refusal has one reason and the
    /// words for it belong to the caller: the install path reports it as
    /// `update.blocked.scanning`, not as a scan failure.
    pub fn close(&self) -> bool {
        let mut state = self.lock();
        if state.running {
            return false;
        }
        state.closed = true;
        true
    }

    pub fn checkpoint(&self) -> Result<(), AppError> {
        let mut state = self.lock();
        while state.paused && !state.cancelled {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(|error| error.into_inner());
        }
        if state.cancelled {
            return Err(AppError::new(SCAN_CANCELLED, "Scan cancelled"));
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
        let mut state = self.lock();
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

    /// Writes the status and hands back what a reader would see from now on.
    ///
    /// The overlay is applied here rather than only at the reader, so a caller
    /// that has just written a status can send it out without reading it back —
    /// one lock instead of two, and one way to get it right instead of a dozen.
    /// What must not change is which of the two is sent: a paused pass keeps
    /// reporting `paused` while its own work moves the rest of the status on,
    /// and a caller that sent back the value it passed in would lose that. Both
    /// readers go through [`State::seen`], so that is not a second rule to keep
    /// in step.
    pub fn publish(&self, status: ScanStatus) -> ScanStatus {
        let mut state = self.lock();
        state.status = status;
        state.seen()
    }

    pub fn status(&self) -> ScanStatus {
        self.lock().seen()
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
        let mut state = self.0.lock();
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
            space_change_gate(control.is_running()).unwrap_err().code,
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
    fn a_closed_slot_refuses_every_later_scan() {
        let control = Arc::new(ScanControl::default());
        assert!(control.close());
        // Not queued for later: the only caller of `close` is on its way out of
        // the process, so there is no later to run a scan in.
        assert_eq!(control.begin().err().unwrap().code, "media.scan.busy");
        assert!(control.close());
    }

    #[test]
    fn closing_a_slot_a_task_holds_is_refused_and_not_spent() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        // Refused, not spent: closing is for good, so a task in the way must
        // leave it open rather than close it behind itself.
        assert!(!control.close());
        drop(guard);
        assert!(control.close());
        assert!(control.begin().is_err());
    }

    #[test]
    fn publishing_while_paused_reports_paused_rather_than_what_was_written() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        control.action("pause").unwrap();
        // A paused pass keeps working, so it keeps writing what the work is
        // doing. The phase is not the writer's to choose while the pause is on:
        // without this the interface would be told "processing" and the user
        // would watch a pause that did not take.
        let snapshot = control.publish(ScanStatus {
            phase: "processing".into(),
            processed: 3,
            ..Default::default()
        });
        assert_eq!(snapshot.phase, "paused");
        assert_eq!(snapshot.processed, 3);
        // The writer is handed what a reader would see, so the two cannot drift.
        assert_eq!(control.status().phase, snapshot.phase);
        assert_eq!(control.status().processed, snapshot.processed);
        drop(guard);
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
