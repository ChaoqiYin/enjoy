use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::error::AppError;
use crate::i18n::language;
use crate::repository::lock_shared;
use crate::share::{ShareStatus, DEFAULT_PORT};

/// Starts the 共享服务 on the port it is registered on, over the 共享清单 of the
/// space the interface is showing.
///
/// The space is named by the caller like every other command's (ADR 0012), and
/// the list is read here rather than inside the share module: which videos are
/// on it is the library's business, and opening a port is not.
///
/// The language is read here rather than passed from the interface because the
/// landing page is written by this side of the seam, and the interface is not
/// told which one it is reading: it is the same language the person who pressed
/// the button is looking at.
#[tauri::command]
pub(crate) fn open_share(
    space_id: i64,
    state: State<'_, AppState>,
    languages: State<'_, language::LanguageState>,
) -> Result<ShareStatus, AppError> {
    let language = language::current(&languages)?;
    let paths = lock_shared(&state.repository)?.shared_paths(space_id)?;
    state.share.open(Some(DEFAULT_PORT), &language, &paths)
}

/// Ends the service, and answers once the port is free again.
///
/// On a blocking thread because ending joins the thread that was serving, and
/// the answer is not sent until the port has actually been given back: a
/// caller told the service stopped is entitled to act on it.
#[tauri::command]
pub(crate) async fn close_share(state: State<'_, AppState>) -> Result<ShareStatus, AppError> {
    let share = Arc::clone(&state.share);
    tauri::async_runtime::spawn_blocking(move || share.close())
        .await
        .map_err(|error| AppError::new("share.stop_failed", error))
}

#[tauri::command]
pub(crate) fn share_status(state: State<'_, AppState>) -> ShareStatus {
    state.share.status()
}
