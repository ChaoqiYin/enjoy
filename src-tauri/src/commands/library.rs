use std::sync::Arc;

use crate::app::AppState;
use crate::error::AppError;
use crate::model::{VideoPage, VideoQuery};
use crate::player;
use crate::repository::lock_shared;
use tauri::State;

/// One page of the library, as the interface asked for it.
///
/// The command name is unchanged while what it takes is not, and that is the
/// point: the listing is one thing the interface asks for, however many
/// questions the answer to it is made of. A second command beside this one would
/// be a second name `check-commands.mjs` has to hold, and a second way to ask for
/// the same records (ADR 0016).
#[tauri::command]
pub(crate) fn list_videos(
    query: VideoQuery,
    state: State<'_, AppState>,
) -> Result<VideoPage, AppError> {
    lock_shared(&state.repository)?.list(&query)
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

#[tauri::command]
pub(crate) fn set_shared(
    space_id: i64,
    path: String,
    shared: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    lock_shared(&state.repository)?.share(space_id, &path, shared)
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
