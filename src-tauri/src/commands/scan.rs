use std::sync::Arc;

use crate::app::{database_path, thumbnail_cache, AppState};
use crate::error::AppError;
use crate::events::{AppEvents, Events};
use crate::media::MediaProcessor;
use crate::model::VideoFile;
use crate::scan::control::ScanStatus;
use crate::scan::session;
use tauri::State;

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

#[tauri::command]
pub(crate) async fn rescan_directories(
    space_id: i64,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<VideoFile>, AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let handle = app.clone();
    let events = AppEvents(app);
    tauri::async_runtime::spawn_blocking(move || {
        let media = MediaProcessor::for_app(&handle, thumbnail_cache(&database_path(&handle)?))?;
        session::rescan(guard, space_id, &repository, &control, &media, &events)
    })
    .await
    .map_err(|error| AppError::new("media.scan.failed", error))?
}

#[tauri::command]
pub(crate) async fn refresh_video_info(
    space_id: i64,
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let handle = app.clone();
    let events = AppEvents(app);
    tauri::async_runtime::spawn_blocking(move || {
        let media = MediaProcessor::for_app(&handle, thumbnail_cache(&database_path(&handle)?))?;
        session::refresh_info(
            guard,
            space_id,
            &path,
            &repository,
            &control,
            &media,
            &events,
        )
    })
    .await
    .map_err(|error| AppError::new("media.metadata.failed", error))?
}

#[tauri::command]
pub(crate) async fn regenerate_thumbnails(
    space_id: i64,
    path: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let guard = control.begin()?;
    let handle = app.clone();
    let events = AppEvents(app);
    tauri::async_runtime::spawn_blocking(move || {
        let media = MediaProcessor::for_app(&handle, thumbnail_cache(&database_path(&handle)?))?;
        session::regenerate_thumbnails(
            guard,
            space_id,
            path,
            &repository,
            &control,
            &media,
            &events,
        )
    })
    .await
    .map_err(|error| AppError::new("media.thumbnail.failed", error))?
}
