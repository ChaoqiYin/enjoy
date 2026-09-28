use tauri::{AppHandle, State};

use crate::app::AppState;
use crate::commands::share::end_service;
use crate::error::AppError;

/// Closes the window, ending the 共享服务 first if one is running.
///
/// The answer to the question the backend put when the close was held
/// ([`crate::closing`]): the user has said yes, and this is what yes does. It is
/// one command rather than two — end the service, then close the window — because
/// what the user answered was one thing, and two calls would put the closing of
/// the window at the mercy of the ending of a service the process is about to
/// release the port of anyway.
///
/// The ending is not reported back, and cannot be: the window is going away, and
/// with it the interface that would show the failure. It is still done, and done
/// first, because it is what gives a device in the middle of a film a clean end
/// rather than a connection that stops answering.
#[tauri::command]
pub(crate) async fn close_window(
    app: AppHandle,
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), AppError> {
    let _ = end_service(app, std::sync::Arc::clone(&state.share)).await;
    window
        .destroy()
        .map_err(|error| AppError::new("app.close.failed", error))
}
