//! The two JSON shapes a task crosses the wasm boundary in.
//!
//! Out goes [`TaskView`]: what a plugin is told about the work it just claimed.
//! In comes [`finished_fields`]: the answer a plugin hands to `task_done`. Both
//! are translations between the row in the library and the small, stable shape
//! a guest reads, and neither is a rule about the queue — which is why they are
//! beside `tasks.rs` rather than in it.

use crate::model::{Task, VideoField};
use crate::plugins::mount_points::{is_field_key, FieldValue};

/// The shape `task_done` accepts for a finished task's fields.
///
/// `{"fields": [{"key": "title", "value": "…"}]}`, the same pair the
/// `video.fields` result is written in. A missing `fields` is an empty answer,
/// which is what a task that did its work but found nothing has to say.
#[derive(serde::Deserialize)]
struct DoneFields {
    #[serde(default)]
    fields: Vec<FieldValue>,
}

/// Reads what a plugin handed to `task_done` into rows the landing can write.
///
/// An empty answer is a task that found nothing, not a malformed one: a plugin
/// with nothing to hand over should not have to spell out an empty object to
/// say so. Keys outside the closed set (spec #96 §9) are dropped here as well
/// as in the repository, because the plugin is owed a line in the log that
/// names the key it sent, and the rows the landing reads should be ones the
/// library can store.
///
/// An `Err` is the plugin's malformed answer, and the caller refuses the call:
/// the task keeps running, so the plugin can report something it can fix.
pub(super) fn finished_fields(
    plugin: &str,
    answer: &str,
    task_id: i64,
) -> Result<Vec<VideoField>, serde_json::Error> {
    let answer: DoneFields = if answer.trim().is_empty() {
        DoneFields { fields: Vec::new() }
    } else {
        serde_json::from_str(answer)?
    };
    Ok(answer
        .fields
        .into_iter()
        .filter(|field| {
            if is_field_key(&field.key) {
                return true;
            }
            tracing::warn!(
                plugin,
                task = task_id,
                key = %field.key,
                "A plugin answered with a field key outside the closed set"
            );
            false
        })
        .map(|field| VideoField {
            key: field.key,
            value: field.value,
            source_plugin: plugin.to_string(),
        })
        .collect())
}

/// One task, as a plugin reads it.
///
/// Not [`Task`] itself: the row carries the kernel's bookkeeping — `plugin`,
/// the request marks, the times — which is none of a plugin's business and none
/// of what it needs to do the work. What is left is the work's own description
/// and where it has got to.
#[derive(serde::Serialize)]
pub(super) struct TaskView<'a> {
    id: i64,
    kind: &'a str,
    space_id: i64,
    video_id: Option<i64>,
    payload: &'a str,
    state: &'a str,
    attempts: i64,
    progress_current: Option<i64>,
    progress_total: Option<i64>,
    progress_label: Option<&'a str>,
    last_error: Option<&'a str>,
}

impl<'a> TaskView<'a> {
    pub(super) fn of(task: &'a Task) -> Self {
        Self {
            id: task.id,
            kind: &task.kind,
            space_id: task.space_id,
            video_id: task.video_id,
            payload: &task.payload,
            state: task.state.as_str(),
            attempts: task.attempts,
            progress_current: task.progress_current,
            progress_total: task.progress_total,
            progress_label: task.progress_label.as_deref(),
            last_error: task.last_error.as_deref(),
        }
    }
}
