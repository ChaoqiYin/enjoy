//! One task's life after it is claimed: the progress its owner reports, and
//! the two ways an attempt ends.
//!
//! Every write here answers only for a task that is `running`, because that
//! is the whole of who is allowed to speak: progress, completion and failure
//! are things an owner says about work it is doing *now*. A task the user has
//! paused, or one that already finished, refuses these with
//! `task.invalid_state` — a report from a stale attempt must not be able to
//! overwrite what the task page shows, and the check is in the statement's own
//! condition so a report cannot land one write late (spec #96 §2, §5).
//!
//! A failure is the one ending with a decision to make: with a retry time it
//! is not an ending at all but a reschedule — back to `pending`, waiting for
//! the time the owner named, with the reason still on the row for the task
//! page to show. Without one it is terminal. Retrying a terminal failure from
//! the task page is the mirror image and lives here too.

use rusqlite::params;

use crate::error::AppError;
use crate::model::{TaskAction, TaskSignal, TaskState};

use super::tasks::{invalid_state, task_row, COLUMNS};
use super::{now, Repository};

impl Repository {
    /// How far one running task has got, as its owner last said.
    ///
    /// The whole triple is written, not merged: a report is a complete answer
    /// — "3 of 12, 正在请求" — and a label left over from the previous report
    /// would say the wrong thing beside the new numbers.
    pub(crate) fn set_task_progress(
        &mut self,
        id: i64,
        current: i64,
        total: Option<i64>,
        label: Option<&str>,
    ) -> Result<(), AppError> {
        let changed = self.connection.execute(
            "UPDATE tasks SET progress_current=?2, progress_total=?3, \
             progress_label=?4, updated_at=?5 \
             WHERE id=?1 AND state='running'",
            params![id, current, total, label, now()],
        )?;
        self.require_running(id, changed)
    }

    /// Marks a running task's work as done. The landing of what the work
    /// produced is the caller's next step, deliberately separate: `task_done`
    /// says the plugin finished, and writing the fields into the library is
    /// the kernel's own asynchronous follow-through (spec #96 §6).
    pub(crate) fn complete_task(&mut self, id: i64) -> Result<(), AppError> {
        let at = now();
        let changed = self.connection.execute(
            "UPDATE tasks SET state='done', finished_at=?2, updated_at=?2, \
             pause_requested=0, cancel_requested=0 \
             WHERE id=?1 AND state='running'",
            params![id, at],
        )?;
        self.require_running(id, changed)
    }

    /// Ends a running attempt as a failure.
    ///
    /// With a retry time the task goes back to waiting for exactly that time,
    /// and `last_error` stays on the row: the reason the last attempt failed
    /// is what the task page shows while the next one is scheduled. Without
    /// one the failure is terminal — the owner has decided this task will not
    /// be tried again, and only the task page's retry can bring it back
    /// (spec #96 §2).
    pub(crate) fn fail_task(
        &mut self,
        id: i64,
        message: &str,
        retry_at: Option<i64>,
    ) -> Result<(), AppError> {
        let at = now();
        let changed = match retry_at {
            Some(at_time) => self.connection.execute(
                "UPDATE tasks SET state='pending', last_error=?2, available_at=?3, \
                 updated_at=?4 WHERE id=?1 AND state='running'",
                params![id, message, at_time, at],
            )?,
            None => self.connection.execute(
                "UPDATE tasks SET state='failed', last_error=?2, finished_at=?3, \
                 updated_at=?3, pause_requested=0, cancel_requested=0 \
                 WHERE id=?1 AND state='running'",
                params![id, message, at],
            )?,
        };
        self.require_running(id, changed)
    }

    /// Turns a zero-row update into the right verdict: the task is not there,
    /// or it is not in the state the write was for. Both are refused rather
    /// than reported as success, and which one it is decides the words the
    /// user reads.
    fn require_running(&self, id: i64, changed: usize) -> Result<(), AppError> {
        if changed > 0 {
            return Ok(());
        }
        self.task(id)?;
        Err(invalid_state())
    }
}

impl Repository {
    /// The verdict a running task's next checkpoint receives.
    ///
    /// Cancel outranks pause when both marks are somehow set: a user who
    /// asked for both gets the answer that cannot be resumed from, which is
    /// the safer of the two to honour.
    pub(crate) fn task_checkpoint(&self, id: i64) -> Result<TaskSignal, AppError> {
        let task = self.connection.query_row(
            &format!("SELECT {COLUMNS} FROM tasks WHERE id=?1"),
            [id],
            task_row,
        )?;
        Ok(
            if task.cancel_requested || task.state == TaskState::Cancelled {
                TaskSignal::Cancel
            } else if task.pause_requested || task.state == TaskState::Paused {
                TaskSignal::Pause
            } else {
                TaskSignal::Run
            },
        )
    }

    /// Carries out a pause a checkpoint reported: the running task steps out
    /// of the queue and its request mark is cleared — the request has been
    /// acted on, and what remains is the state the user asked for.
    // No caller yet: a paused pass waits at its checkpoint with the mark on the
    // row rather than returning, so nothing acknowledges the pause by moving
    // the row. The transition is kept for an owner that does (spec #96 §2
    // states it), and its tests keep the SQL honest until then.
    #[allow(dead_code)]
    pub(crate) fn apply_task_pause(&mut self, id: i64) -> Result<(), AppError> {
        let changed = self.connection.execute(
            "UPDATE tasks SET state='paused', pause_requested=0, updated_at=?2 \
             WHERE id=?1 AND state='running'",
            params![id, now()],
        )?;
        self.require_running(id, changed)
    }

    /// Carries out a cancel a checkpoint reported, for the same reason.
    pub(crate) fn apply_task_cancel(&mut self, id: i64) -> Result<(), AppError> {
        let at = now();
        let changed = self.connection.execute(
            "UPDATE tasks SET state='cancelled', cancel_requested=0, finished_at=?2, \
             updated_at=?2, pause_requested=0 \
             WHERE id=?1 AND state='running'",
            params![id, at],
        )?;
        self.require_running(id, changed)
    }

    /// The task page's 继续: a paused task goes back to waiting, ready to be
    /// claimed again now.
    ///
    /// Two shapes of "paused" answer to the same word, and the running one is
    /// the newer. A task the user stopped *before* it was claimed sits in
    /// `paused` and is simply put back in the queue. A task that was running is
    /// frozen where it was — the pass is waiting at its own checkpoint with the
    /// request mark set and the state still `running` — and 继续 here clears
    /// the mark rather than the state, so the work carries on from where it
    /// stopped instead of being started over (spec #96 §2, #101).
    pub(crate) fn resume_task(&mut self, id: i64) -> Result<(), AppError> {
        let at = now();
        let requeued = self.connection.execute(
            "UPDATE tasks SET state='pending', available_at=?2, updated_at=?2 \
             WHERE id=?1 AND state='paused'",
            params![id, at],
        )?;
        if requeued > 0 {
            return Ok(());
        }
        let unfrozen = self.connection.execute(
            "UPDATE tasks SET pause_requested=0, updated_at=?2 \
             WHERE id=?1 AND state='running' AND pause_requested=1",
            params![id, at],
        )?;
        if unfrozen > 0 {
            return Ok(());
        }
        self.task(id)?;
        Err(invalid_state())
    }

    /// The task page's 重试: a terminal failure goes back to the front of its
    /// queue, with the error cleared — the retry is a fresh question, and the
    /// message that came before is what the *last* attempt failed with.
    pub(crate) fn retry_task(&mut self, id: i64) -> Result<(), AppError> {
        let at = now();
        let changed = self.connection.execute(
            "UPDATE tasks SET state='pending', available_at=?2, updated_at=?2, \
             last_error=NULL, finished_at=NULL \
             WHERE id=?1 AND state='failed'",
            params![id, at],
        )?;
        if changed > 0 {
            return Ok(());
        }
        self.task(id)?;
        Err(invalid_state())
    }

    /// Applies one of the task page's four actions, as the transition that
    /// action asks for.
    ///
    /// The actions are the interface's vocabulary, parsed once at the command;
    /// which transition each one means lives here so the two ends of the queue
    /// — the task page and the status bar — cannot mean different things by
    /// the same word.
    pub(crate) fn apply_task_action(
        &mut self,
        id: i64,
        action: TaskAction,
    ) -> Result<(), AppError> {
        match action {
            TaskAction::Pause => self.request_task_pause(id),
            TaskAction::Resume => self.resume_task(id),
            TaskAction::Cancel => self.request_task_cancel(id),
            TaskAction::Retry => self.retry_task(id),
        }
    }

    /// The task page's 暂停, asked for while the task is queued or waiting:
    /// there is no checkpoint to reach, so the state moves now. A running task
    /// is the other case, and it takes the request as a mark instead.
    pub(crate) fn request_task_pause(&mut self, id: i64) -> Result<(), AppError> {
        let changed = self.connection.execute(
            "UPDATE tasks SET \
             state=CASE WHEN state='pending' THEN 'paused' ELSE state END, \
             pause_requested=CASE WHEN state='running' THEN 1 ELSE pause_requested END, \
             updated_at=?2 \
             WHERE id=?1 AND state IN ('pending','running') AND pause_requested=0",
            params![id, now()],
        )?;
        if changed > 0 {
            return Ok(());
        }
        self.task(id)?;
        Err(invalid_state())
    }

    /// The task page's 取消, with the same split as the pause: queued or
    /// paused tasks are cancelled now, running ones take the mark and act on
    /// it at their next checkpoint (spec #96 §2).
    pub(crate) fn request_task_cancel(&mut self, id: i64) -> Result<(), AppError> {
        let at = now();
        let changed = self.connection.execute(
            "UPDATE tasks SET \
             state=CASE WHEN state IN ('pending','paused') THEN 'cancelled' ELSE state END, \
             finished_at=CASE WHEN state IN ('pending','paused') THEN ?2 ELSE finished_at END, \
             cancel_requested=CASE WHEN state='running' THEN 1 ELSE cancel_requested END, \
             updated_at=?2 \
             WHERE id=?1 AND state IN ('pending','paused','running') AND cancel_requested=0",
            params![id, at],
        )?;
        if changed > 0 {
            return Ok(());
        }
        self.task(id)?;
        Err(invalid_state())
    }
}
