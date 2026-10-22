//! What the queue does when the application starts again, before any owner
//! claims anything: interrupted work goes back to waiting, finished work past
//! its retention is removed.
//!
//! Both rules are about a task rows left behind rather than about anything a
//! user did just now, which is why they are one file and one call each rather
//! than transitions beside the ones in [`super::task_states`] — nothing here
//! answers for a single running task, it answers for what an exit and a week
//! do to the table as a whole (spec #96 §1).

// The start-up path calls the recovery rule: the kernel's owner claims tasks
// when the application starts, and a task an exit left `running` is work that
// was never finished, so it goes back to waiting before the owner looks
// (spec #101). The sweep that purges is not called by the start-up path yet —
// the task page's own read hides expired rows in the meantime — so only that
// one function asks to be excused for having no caller.

use rusqlite::params;

use crate::error::AppError;

use super::{now, Repository};

/// How long a finished task is kept for the task page to show, in
/// milliseconds: seven days, the retention the spec fixes (spec #96 §1,
/// User Story 8).
///
/// `pub(super)` because the page's read hides finished work past the same
/// window without deleting it ([`super::task_listing`]) — one retention, two
/// questions, so the number is written down once.
pub(super) const FINISHED_RETENTION: i64 = 7 * 24 * 60 * 60 * 1000;

impl Repository {
    /// Puts every task an exit left running back to waiting.
    ///
    /// The attempt is *not* counted back and no error is recorded: scanning is
    /// incremental and scraping is idempotent, so the work is safe to run
    /// again, and an application exiting is not a failure of the work itself
    /// (spec #96 §1). `started_at` stays as history; only the state and the
    /// schedule move.
    pub(crate) fn recover_tasks(&mut self) -> Result<(), AppError> {
        let at = now();
        self.connection.execute(
            "UPDATE tasks SET state='pending', available_at=?1, updated_at=?1 \
             WHERE state='running'",
            params![at],
        )?;
        Ok(())
    }

    /// Removes the tasks that finished more than a week ago.
    ///
    /// The task page keeps terminal tasks for a while so a user can see what
    /// happened, and this is what stops that window from filling the table
    /// forever. Unfinished tasks are never aged out — the retention is a
    /// display promise for finished work, not a deadline for work still to do.
    ///
    /// Kept for the start-up sweep it is written for, which nothing runs yet:
    /// the task page's own read hides expired rows, so the rule holds while
    /// this waits for its caller. Its tests are what keep the SQL honest in the
    /// meantime.
    #[allow(dead_code)]
    pub(crate) fn purge_finished_tasks(&mut self) -> Result<usize, AppError> {
        let cutoff = now() - FINISHED_RETENTION;
        let removed = self.connection.execute(
            "DELETE FROM tasks WHERE state IN ('done','failed','cancelled') \
             AND finished_at < ?1",
            params![cutoff],
        )?;
        Ok(removed)
    }
}
