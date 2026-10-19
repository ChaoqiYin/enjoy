//! The queue's own two moves: work goes in under its key, and an owner takes
//! the next piece of its own work out.
//!
//! Both are decided inside one transaction each, because both are a question
//! and an answer that must not drift apart: the enqueue asks whether the key
//! is already held and inserts the answer, the claim picks a row and marks it
//! claimed. The single-process write path makes the transaction a formality
//! rather than a necessity, and the dedup deliberately is *not* a unique index
//! — the key is (owner, space, video, kind) over the non-terminal states only,
//! which an index cannot express and a predicate in one transaction can
//! (spec #96 §1).

// Nothing in the kernel calls either move yet: the commands that enqueue and
// the host loop that claims are later issues of the same spec (#98 and its
// neighbours), so the module is written down and exercised by its own tests
// first. The whole module carries `#[allow(dead_code)]` until then, the way
// `Events::plugin_failed` does (spec #82).
#![allow(dead_code)]

use rusqlite::{params, OptionalExtension, Row};

use crate::error::AppError;
use crate::model::{Task, TaskState};

use super::{now, Repository};

/// The columns a task is read from, in the order [`task_row`] reads them.
pub(crate) const COLUMNS: &str = "id,plugin,space_id,video_id,kind,payload,state,\
pause_requested,cancel_requested,progress_current,progress_total,progress_label,\
attempts,last_error,available_at,created_at,updated_at,started_at,finished_at";

/// One task, off a row the [`COLUMNS`] above were selected in.
pub(crate) fn task_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    let state = row.get::<_, String>(6)?;
    let state = TaskState::from_stored(&state).ok_or(rusqlite::types::FromSqlError::Other(
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "a task state this build does not know",
        )),
    ))?;
    Ok(Task {
        id: row.get(0)?,
        plugin: row.get(1)?,
        space_id: row.get(2)?,
        video_id: row.get(3)?,
        kind: row.get(4)?,
        payload: row.get(5)?,
        state,
        pause_requested: row.get(7)?,
        cancel_requested: row.get(8)?,
        progress_current: row.get(9)?,
        progress_total: row.get(10)?,
        progress_label: row.get(11)?,
        attempts: row.get(12)?,
        last_error: row.get(13)?,
        available_at: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        started_at: row.get(17)?,
        finished_at: row.get(18)?,
    })
}

/// The verdict a task id gets when there is no row under it.
pub(crate) fn not_found() -> AppError {
    AppError::new("task.not_found", "Task does not exist")
}

/// The verdict a task gets when the action does not apply to the state it is
/// in — a progress report after the task finished, a retry of a task that did
/// not fail, a pause of one that is done.
pub(crate) fn invalid_state() -> AppError {
    AppError::new("task.invalid_state", "Task is not in a state this action applies to")
}

impl Repository {
    /// One task by id — the question every write's caller asks afterwards to
    /// see the row it changed.
    pub(crate) fn task(&self, id: i64) -> Result<Task, AppError> {
        self.connection
            .query_row(
                &format!("SELECT {COLUMNS} FROM tasks WHERE id=?1"),
                [id],
                task_row,
            )
            .optional()?
            .ok_or_else(not_found)
    }

    /// Queues one piece of work and answers with its id.
    ///
    /// The same key already held by a task that is not finished answers with
    /// *that* task's id rather than a second row: clicking "scrape" twice is
    /// one scrape in the queue, and the second click's payload is dropped
    /// rather than overwriting the first — the task already queued is the one
    /// the user asked for the first time (spec #96 §1, User Story 15).
    pub(crate) fn push_task(
        &mut self,
        plugin: Option<&str>,
        space_id: i64,
        video_id: Option<i64>,
        kind: &str,
        payload: &str,
    ) -> Result<i64, AppError> {
        let tx = self.connection.transaction()?;
        // `IS` rather than `=` on the two nullable halves of the key: a kernel
        // task's owner and a taskless scan's video are NULL, and `= NULL`
        // matches no row — not even another NULL.
        let held: Option<i64> = tx
            .query_row(
                "SELECT id FROM tasks WHERE plugin IS ?1 AND space_id=?2 \
                 AND video_id IS ?3 AND kind=?4 \
                 AND state NOT IN ('done','failed','cancelled')",
                params![plugin, space_id, video_id, kind],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(id) = held {
            return Ok(id);
        }
        let at = now();
        tx.execute(
            "INSERT INTO tasks (plugin,space_id,video_id,kind,payload,state,\
             available_at,created_at,updated_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?7)",
            params![plugin, space_id, video_id, kind, payload, TaskState::Pending.as_str(), at],
        )?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        Ok(id)
    }

    /// Takes the owner's earliest runnable task, and answers with it marked
    /// running — or with nothing when the owner has no work ready.
    ///
    /// Runnable is `pending` with `available_at` already reached; `paused` is
    /// never claimed, and a task scheduled for later waits for its time. The
    /// claim is the whole of starting a task: state to running, one more
    /// attempt counted, the start time stamped (spec #96 §2). The owner is the
    /// argument and the only selector — one queue per owner, so a plugin
    /// cannot be handed the kernel's work or another plugin's, and the
    /// identity binding the host layer does is echoed by what this read asks
    /// for.
    pub(crate) fn claim_task(
        &mut self,
        plugin: Option<&str>,
    ) -> Result<Option<Task>, AppError> {
        let at = now();
        let tx = self.connection.transaction()?;
        let claimed: Option<i64> = tx
            .query_row(
                "SELECT id FROM tasks WHERE plugin IS ?1 AND state='pending' \
                 AND available_at<=?2 ORDER BY available_at,id LIMIT 1",
                params![plugin, at],
                |row| row.get(0),
            )
            .optional()?;
        let Some(id) = claimed else {
            return Ok(None);
        };
        tx.execute(
            "UPDATE tasks SET state='running', attempts=attempts+1, \
             started_at=?2, updated_at=?2 WHERE id=?1 AND state='pending'",
            params![id, at],
        )?;
        let task = tx.query_row(
            &format!("SELECT {COLUMNS} FROM tasks WHERE id=?1"),
            [id],
            task_row,
        )?;
        tx.commit()?;
        Ok(Some(task))
    }
}
