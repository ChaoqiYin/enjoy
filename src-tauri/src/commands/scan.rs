use std::sync::{Arc, Mutex};

use tauri::State;

use crate::app::{database_path, thumbnail_cache, AppState};
use crate::error::AppError;
use crate::events::{AppEvents, Events};
use crate::media::MediaProcessor;
use crate::model::VideoFile;
use crate::repository::Repository;
use crate::scan::control::{ScanControl, ScanGuard, ScanStatus};
use crate::scan::session;

#[tauri::command]
pub(crate) fn scan_status(state: State<'_, AppState>) -> ScanStatus {
    state.scan.status()
}

#[tauri::command]
pub(crate) fn scan_action(
    action: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    state.scan.action(&action)?;
    AppEvents(app).scan_progress(state.scan.status());
    Ok(())
}

/// Runs one media job on a blocking thread, with the scan slot taken first.
///
/// The three things every one of these commands has to get right, in one place:
/// the slot is taken here rather than on the thread, so a second request is
/// refused straight away instead of waiting for a thread to become free; the
/// media tools are built on the thread, because finding them reads the
/// application's own directories and can fail; and the job is handed the four
/// things it touches rather than the state it came out of.
///
/// The commands below were fifteen near-identical lines three times over,
/// differing only in which job ran and in the code a thread that panicked is
/// reported under. Those two are what this takes.
///
/// What it does not own is the slot's lifetime once the job is running: the
/// guard goes to the job, and [`session`] is where it lands.
async fn media_job<T, F>(
    app: tauri::AppHandle,
    state: &AppState,
    thread_failed: &'static str,
    job: F,
) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(
            ScanGuard,
            &Arc<Mutex<Repository>>,
            &Arc<ScanControl>,
            &MediaProcessor,
            &AppEvents,
        ) -> Result<T, AppError>
        + Send
        + 'static,
{
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let media = MediaProcessor::for_app(&handle, thumbnail_cache(&database_path(&handle)?))?;
        job(guard, &repository, &control, &media, &AppEvents(handle))
    })
    .await
    .map_err(|error| AppError::new(thread_failed, error))?
}

#[tauri::command]
pub(crate) async fn rescan_directories(
    space_id: i64,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<VideoFile>, AppError> {
    media_job(
        app,
        &state,
        "media.scan.failed",
        move |guard, repository, control, media, events| {
            session::rescan(guard, space_id, repository, control, media, events)
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn refresh_video_info(
    space_id: i64,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    media_job(
        app,
        &state,
        "media.metadata.failed",
        move |guard, repository, control, media, events| {
            session::refresh_info(guard, space_id, &path, repository, control, media, events)
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn regenerate_thumbnails(
    space_id: i64,
    path: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    media_job(
        app,
        &state,
        "media.thumbnail.failed",
        move |guard, repository, control, media, events| {
            session::regenerate_thumbnails(
                guard, space_id, path, repository, control, media, events,
            )
        },
    )
    .await
}
