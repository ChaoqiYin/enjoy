//! The task page's one read: every task in every space, joined to the names
//! it draws, with finished work aged out after its week.
//!
//! One query rather than a page of one space, because the queue is the
//! application's and not any space's: work the user queued in one space is
//! visible wherever they are, and the space is drawn on the row so the
//! answer to "which one?" is on screen rather than in the user's head
//! (spec #102).
//!
//! The retention mirrors [`super::task_maintenance::purge_finished_tasks`]
//! rather than depending on it having run: the sweep removes finished work
//! past its week at start-up, and this read hides the same window in case a
//! week passed while the application was open. One retention number, two
//! questions — remove, and do not draw.

use rusqlite::{params, Row};

use crate::error::AppError;
use crate::model::{TaskRow, TaskState};

use super::task_maintenance::FINISHED_RETENTION;
use super::{now, Repository};

impl Repository {
    /// Every task worth drawing, in the order the page draws them: work to do
    /// above work that finished, the most recently touched first inside each
    /// half.
    ///
    /// The terminal half is ordered by `finished_at` rather than `updated_at`
    /// because those are the same moment for a task that finishes in one
    /// write, and a different question the moment a failure records a reason
    /// or a retry clears the marks — what a user scanning finished work wants
    /// is when it ended, not when its row was last rewritten.
    pub(crate) fn list_tasks(&mut self) -> Result<Vec<TaskRow>, AppError> {
        let cutoff = now() - FINISHED_RETENTION;
        let mut statement = self.connection.prepare(
            "SELECT t.id, t.plugin, t.space_id, s.name, t.video_id, v.file_name, \
             t.kind, t.state, t.pause_requested, t.cancel_requested, \
             t.progress_current, t.progress_total, t.progress_label, \
             t.attempts, t.last_error, t.updated_at \
             FROM tasks t \
             JOIN spaces s ON s.id = t.space_id \
             LEFT JOIN videos v ON v.id = t.video_id \
             WHERE NOT (t.state IN ('done','failed','cancelled') \
             AND t.finished_at < ?1) \
             ORDER BY CASE WHEN t.state IN ('done','failed','cancelled') \
             THEN 1 ELSE 0 END, \
             CASE WHEN t.state IN ('done','failed','cancelled') \
             THEN t.finished_at END DESC, \
             t.updated_at DESC, t.id DESC",
        )?;
        let rows = statement.query_map(params![cutoff], task_row_view)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

/// One drawn row, off the joined columns [`Repository::list_tasks`] selected.
///
/// The state word goes through the same closed vocabulary the queue's own
/// read uses: a row whose state this build has never heard of is data that
/// cannot be answered for, not a state to invent a neighbour for.
fn task_row_view(row: &Row<'_>) -> rusqlite::Result<TaskRow> {
    let state = row.get::<_, String>(7)?;
    let state = TaskState::from_stored(&state).ok_or(rusqlite::types::FromSqlError::Other(
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "a task state this build does not know",
        )),
    ))?;
    Ok(TaskRow {
        id: row.get(0)?,
        plugin: row.get(1)?,
        space_id: row.get(2)?,
        space_name: row.get(3)?,
        video_id: row.get(4)?,
        video_name: row.get(5)?,
        kind: row.get(6)?,
        state: state.as_str().to_string(),
        pause_requested: row.get(8)?,
        cancel_requested: row.get(9)?,
        progress_current: row.get(10)?,
        progress_total: row.get(11)?,
        progress_label: row.get(12)?,
        attempts: row.get(13)?,
        last_error: row.get(14)?,
        updated_at: row.get(15)?,
    })
}
