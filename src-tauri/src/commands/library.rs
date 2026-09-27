use std::sync::Arc;

use crate::app::AppState;
use crate::error::AppError;
use crate::model::VideoFile;
use crate::player;
use crate::repository::lock_shared;
use tauri::State;

#[tauri::command]
pub(crate) fn list_videos(
    space_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<VideoFile>, AppError> {
    lock_shared(&state.repository)?.list(space_id)
}

#[tauri::command]
pub(crate) fn list_directories(
    space_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    lock_shared(&state.repository)?.directories(space_id)
}

#[tauri::command]
pub(crate) fn remove_video(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    lock_shared(&state.repository)?.remove(space_id, &path)
}

#[tauri::command]
pub(crate) fn remove_directory(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    lock_shared(&state.repository)?.remove_directory(space_id, &path)
}

#[tauri::command]
pub(crate) fn add_directory(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    lock_shared(&state.repository)?.add_directory(space_id, &path)
}

#[tauri::command]
pub(crate) fn set_favorite(
    space_id: i64,
    path: String,
    favorite: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    lock_shared(&state.repository)?.favorite(space_id, &path, favorite)
}

/// Hands the file to the system's own player.
///
/// The work is on a blocking thread because launching a process is not, and the
/// repository is taken out of the state before the move so that nothing derived
/// from the state crosses the thread boundary.
#[tauri::command]
pub(crate) async fn open_video(
    space_id: i64,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = Arc::clone(&state.repository);
    tauri::async_runtime::spawn_blocking(move || {
        player::play(space_id, &repository, &path, player::launch)
    })
    .await
    .map_err(|error| AppError::new("media.player.start_failed", error))?
}
