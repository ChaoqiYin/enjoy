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
    /// The task row this pass is the execution of, when it is one.
    ///
    /// Asked by `scan_action`, which is where a 暂停/继续/取消 that arrived at
    /// the *task row* is carried into the pass that is running: the flags below
    /// are what the work reads at its checkpoints, so a request has to be
    /// written into them or it is not a request at all (spec #101).
    task: Option<i64>,
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

    /// Whether a pass is running, which only the tests ask now.
    ///
    /// The application stopped asking: whether work is in flight is a question
    /// about the queue now, and the queue answers it in rows the task page
    /// reads (spec #101).
    #[cfg(test)]
    pub fn is_running(&self) -> bool {
        self.lock().running
    }

    /// The task row this pass is executing, if this pass is a task's.
    pub fn task_id(&self) -> Option<i64> {
        self.lock().task
    }

    /// Takes the slot for a pass that no task row is waiting on — the shape a
    /// test drives the control in, since a task is claimed by
    /// [`crate::tasks`] in the application itself.
    #[cfg(test)]
    pub fn begin(self: &Arc<Self>) -> ScanGuard {
        self.start(None)
    }

    /// Takes the slot for the execution of one claimed task.
    pub fn begin_task(self: &Arc<Self>, task: i64) -> ScanGuard {
        self.start(Some(task))
    }

    fn start(self: &Arc<Self>, task: Option<i64>) -> ScanGuard {
        // Replaced wholesale, which is also what clears `cancelled` from the
        // pass before. There is no refusal here: two media passes cannot be
        // running at once because the queue claims one task at a time
        // (`crate::tasks`), not because the slot refuses a second take.
        *self.lock() = State {
            running: true,
            task,
            status: ScanStatus {
                phase: "discovering".into(),
                operation: "scan".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        ScanGuard(Arc::clone(self))
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

    /// Carries a request that was written on a task row into the pass that is
    /// running that task.
    ///
    /// The row is where a request is recorded, and the pass is what it stops:
    /// the two are one request seen from two places, so the request has to
    /// reach both. This is the way in from the task page, whose action writes
    /// the row; the status bar's own action writes the row as well and comes
    /// here too, so the two ways of asking the same thing end in the same
    /// place (spec #101).
    ///
    /// A request about another task is about that task and not about this
    /// pass: the kernel's queue is one lane, so only one pass runs at a time,
    /// and a request for a task that is still waiting is carried by the queue
    /// itself — which is what claims it later.
    ///
    /// An action the pass does not know is not a refusal either: a 重试 puts a
    /// task back in line and no pass is holding it.
    pub fn carry(&self, task: i64, action: &str) -> Result<(), AppError> {
        if self.task_id() != Some(task) {
            return Ok(());
        }
        match action {
            "pause" | "resume" | "cancel" => self.action(action),
            _ => Ok(()),
        }
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

impl Drop for ScanGuard {
    fn drop(&mut self) {
        let mut state = self.0.lock();
        state.running = false;
        state.paused = false;
        state.task = None;
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
    fn begin_takes_the_slot_and_says_so_to_a_reader() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin();
        assert!(control.is_running());
        // A pass with no task behind it, which is how a test drives one.
        assert_eq!(control.task_id(), None);
        assert_eq!(control.status().phase, "discovering");
        drop(guard);
        assert!(!control.is_running());
        assert_eq!(control.status().phase, "failed");
    }

    #[test]
    fn a_pass_that_is_a_task_remembers_which_one_while_it_runs() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin_task(7);
        // The one thing `scan_action` needs in order to carry a request into
        // the running pass and back onto its row.
        assert_eq!(control.task_id(), Some(7));
        drop(guard);
        // A finished pass holds no task: the next one to take the slot is a
        // different task's execution, and a request after the end is about
        // nothing.
        assert_eq!(control.task_id(), None);
    }

    #[test]
    fn publishing_while_paused_reports_paused_rather_than_what_was_written() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin();
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
    fn a_cancelled_pass_stops_at_its_next_checkpoint_and_says_cancelled() {
        let control = Arc::new(ScanControl::default());
        let guard = control.begin();
        control.action("pause").unwrap();
        assert_eq!(control.status().phase, "paused");
        // A cancel outranks a pause: the pass is woken out of the wait it is
        // sitting in, and its next checkpoint refuses rather than continuing.
        control.action("cancel").unwrap();
        assert_eq!(
            control.checkpoint().unwrap_err().code,
            "media.scan.cancelled"
        );
        drop(guard);
        assert_eq!(control.status().phase, "cancelled");
    }

    #[test]
    fn the_next_pass_starts_from_what_its_predecessor_left() {
        let control = Arc::new(ScanControl::default());
        let first = control.begin();
        control.action("cancel").unwrap();
        drop(first);
        let next = control.begin();
        control.checkpoint().unwrap();
        control.publish(ScanStatus {
            phase: "complete".into(),
            ..Default::default()
        });
        drop(next);
        assert_eq!(control.status().phase, "complete");
    }
}
