use std::sync::{Arc, Mutex};

use tauri::State;

use crate::app::AppState;
use crate::error::AppError;
use crate::events::{AppEvents, Events};
use crate::model::TaskAction;
use crate::repository::{lock_shared, Repository};
use crate::scan::control::{ScanControl, ScanStatus};

// The three media commands no longer run anything: they queue it. Each answers
// with the task's id, and the kernel's owner (`crate::tasks`) claims it and runs
// it one at a time. What that buys is the slot the three used to share — a
// queue a user can see, pause, and resume — and it moved the mutual exclusion
// out of `ScanControl` and into the queue where the task page can read it
// (spec #96 §3, #101).

#[tauri::command]
pub(crate) fn scan_status(state: State<'_, AppState>) -> ScanStatus {
    state.scan.status()
}

/// Pauses, resumes or cancels the media task the status is about.
///
/// The request is written in two places, because two things read it: the queue,
/// which is what the task page shows and what a later claim sees, and the
/// running pass, which is where the user is looking. [`forward_action`] is the
/// one way both happen, shared with the owner that carries a request written
/// from the task page into the pass it is running.
#[tauri::command]
pub(crate) fn scan_action(
    action: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    act_on_scan(&state, &AppEvents(app), &action)
}

/// The rule the status bar's action is, with the window taken out of it.
///
/// The interface is told which row moved and what the pass now says, because
/// both changed and both are read from somewhere else: the row by the task page,
/// the status by the status bar itself.
pub(crate) fn act_on_scan(
    state: &AppState,
    events: &dyn Events,
    action: &str,
) -> Result<(), AppError> {
    forward_action(&state.scan, &state.repository, action)?;
    if let Some(task) = state.scan.task_id() {
        // The row moved, so the task page's row is not what it was.
        events.task_changed(task);
    }
    events.scan_progress(state.scan.status());
    Ok(())
}

/// Writes a 暂停/继续/取消 onto the row of the task the pass is running, and
/// onto the pass itself.
///
/// The row is written first, so a request that cannot be recorded is reported
/// rather than acted on in memory where no one would see it. The write is
/// skipped when the row already says it: the same request can arrive twice —
/// once from the status bar and once from the task page — and the second
/// arrival is the same request, not a refusal.
///
/// When no task is behind the pass — the second caller — only the pass is
/// touched, which is the shape a test drives; in the application a pass always
/// has a task, because only the owner begins one.
pub(crate) fn forward_action(
    scan: &ScanControl,
    repository: &Arc<Mutex<Repository>>,
    action: &str,
) -> Result<(), AppError> {
    let action = TaskAction::parse(action)
        .filter(|action| *action != TaskAction::Retry)
        .ok_or_else(|| AppError::new("media.scan.invalid_action", "Unknown scan action"))?;
    if let Some(task) = scan.task_id() {
        let mut repository = lock_shared(repository)?;
        let row = repository.task(task)?;
        // The same request can arrive twice — once from the status bar and
        // once from the task page — and the second arrival is the same request,
        // not a refusal.
        let already = match action {
            TaskAction::Pause => row.pause_requested,
            TaskAction::Resume => !row.pause_requested,
            TaskAction::Cancel => row.cancel_requested,
            // A retry was refused above and never reaches this row.
            TaskAction::Retry => true,
        };
        if !already {
            repository.apply_task_action(task, action)?;
        }
    }
    scan.action(action);
    Ok(())
}

/// Queues a scan of the current space's saved directories.
///
/// Answers with the task's id rather than the records: the work has not run
/// yet. The interface learns a scan finished the way it learns a thumbnail
/// pass is over — from what the pass itself reports — and reads the library
/// again on the `library-changed` event the pass sends.
#[tauri::command]
pub(crate) fn rescan_directories(
    space_id: i64,
    state: State<'_, AppState>,
) -> Result<i64, AppError> {
    queue_scan(&state, space_id)
}

/// Queues a scan of one space's saved directories, and answers with the task's
/// id.
///
/// Takes the state rather than a `State<AppState>` so that the rule is
/// reachable from a test: what the command does — a row in the queue, and an
/// id back — is a rule about the queue, and a rule behind a window is a rule
/// no test can check.
pub(crate) fn queue_scan(state: &AppState, space_id: i64) -> Result<i64, AppError> {
    lock_shared(&state.repository)?.push_task(None, space_id, None, "scan", "{}")
}

/// Queues a regeneration of thumbnails for one video, or for the whole space.
///
/// The file is named in the payload as well as in the key: the key is the video
/// the task is about (so a second click is one task), and the payload is what
/// the owner reads to know which shape of pass to run.
#[tauri::command]
pub(crate) fn regenerate_thumbnails(
    space_id: i64,
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, AppError> {
    queue_thumbnails(&state, space_id, path)
}

/// Queues a thumbnail regeneration, and answers with the task's id.
pub(crate) fn queue_thumbnails(
    state: &AppState,
    space_id: i64,
    path: Option<String>,
) -> Result<i64, AppError> {
    let mut repository = lock_shared(&state.repository)?;
    // The video is named so that a second click on the same file is the same
    // task rather than a second one. A file this library does not hold has no
    // id to be named by, and the payload still says which file it is about.
    let video = match &path {
        Some(path) => repository.video_id(space_id, path).ok(),
        None => None,
    };
    let payload = match &path {
        Some(path) => serde_json::json!({ "path": path }).to_string(),
        None => "{}".to_string(),
    };
    repository.push_task(None, space_id, video, "thumbnails", &payload)
}

/// Queues a re-read of one file's metadata.
#[tauri::command]
pub(crate) fn refresh_video_info(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<i64, AppError> {
    queue_refresh(&state, space_id, &path)
}

/// Queues a metadata refresh of one file, and answers with the task's id.
pub(crate) fn queue_refresh(state: &AppState, space_id: i64, path: &str) -> Result<i64, AppError> {
    let mut repository = lock_shared(&state.repository)?;
    let video = repository.video_id(space_id, path).ok();
    let payload = serde_json::json!({ "path": path }).to_string();
    repository.push_task(None, space_id, video, "refresh", &payload)
}
