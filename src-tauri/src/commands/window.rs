use tauri::{AppHandle, State, WebviewWindow};

use crate::app::AppState;
use crate::commands::share::end_service;
use crate::error::AppError;
use crate::i18n::native;

/// Shows the window, which is created hidden and stays that way until the
/// interface has drawn what is going to be on it.
///
/// What the window's first visible frame should be is a fact only the interface
/// has: the theme it will be drawn in, the language, the space to list. So the
/// backend creates the window and stops there, and the interface asks for it
/// once React has committed — one call, rather than the backend guessing at a
/// delay (`shared/WindowReveal.tsx`).
///
/// Nothing happens if this call never arrives, and that is deliberate: it is the
/// honest picture of a frontend that did not come up, and there is no timer on
/// the other side putting the window on screen anyway. What it costs is recorded
/// in ADR 0037 §四 — a process with no window is a failure with no screen.
///
/// A show that fails is reported the way `.setup()` used to report it: natively,
/// because the interface that would draw a notice is inside the window that did
/// not appear. The error also goes back over IPC, so a console can say more;
/// nothing on the interface side acts on it.
///
/// The developer tools are opened here rather than back in `.setup()`, which is
/// what keeps the order the two had — show, then devtools. It is worth saying
/// what this arrangement does *not* give a debug build, because it is a habit
/// that changes: this command is not reached by a frontend that never came up,
/// so that case opens no inspector at all. The way in is Safari's Develop menu
/// (a debug build makes the web view inspectable) and the log file.
#[tauri::command]
pub(crate) fn show_window(app: AppHandle, window: WebviewWindow) -> Result<(), AppError> {
    // Not `async`, unlike `close_window`: that one awaits the 共享服务 ending.
    // This one only shows a window, in the same context `.setup()` used to.
    if let Err(failure) = window.show() {
        let error = AppError::new("app.startup.failed", failure);
        native::startup_failure(&app, &error);
        return Err(error);
    }
    // macOS gives a WKWebView no context-menu entry for the Web inspector, and
    // this app turns the default menu bar off, so a debug build would otherwise
    // have no way to open one. The call itself only exists under
    // `debug_assertions` (or the `devtools` feature), so release builds are
    // unchanged.
    #[cfg(debug_assertions)]
    window.open_devtools();
    Ok(())
}

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
