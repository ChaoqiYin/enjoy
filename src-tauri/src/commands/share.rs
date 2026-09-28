use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::app::AppState;
use crate::error::AppError;
use crate::i18n::language;
use crate::preferences::store;
use crate::repository::lock_shared;
use crate::share::addresses;
use crate::share::credentials::Credentials;
use crate::share::{ShareStatus, DEFAULT_PORT};

/// The 共享清单 of the space a command names, read now.
///
/// One function for the three commands that read it, and the reason it is a
/// function rather than the same two lines three times over is that this is
/// where ADR 0012's rule lives: the list is the *named* space's, read at the
/// moment of the call. A command that read it from somewhere else — the space
/// the interface happens to be on, or the one a running service belongs to —
/// would be serving something the user did not pick. Takes the state rather
/// than a `State<'_, AppState>` so that a test can hold it to that
/// (`share_tests.rs`).
pub(crate) fn list_of(state: &AppState, space_id: i64) -> Result<Vec<String>, AppError> {
    lock_shared(&state.repository)?.shared_paths(space_id)
}

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
///
/// The password is read here too, and read afresh rather than remembered: it can
/// be regenerated between two starts, and a service started with a stale copy
/// would be one the interface could not describe.
///
/// The machine's addresses are read here for the same reason the language is:
/// they are not the share module's business, and the answer the interface is
/// given has to carry both the port that was finally taken and the addresses it
/// can be reached at together — one without the other is not something a user
/// can type.
#[tauri::command]
pub(crate) fn open_share(
    space_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ShareStatus, AppError> {
    let language = language::current(&app)?;
    let credentials = Credentials::load(&store::open(&app)?)?;
    let paths = list_of(&state, space_id)?;
    state.share.open(
        Some(DEFAULT_PORT),
        &language,
        &paths,
        credentials,
        addresses::of_this_machine(),
    )
}

/// Ends the service the interface asked to end, and answers once the port is
/// free again.
///
/// On a blocking thread because ending joins the thread that was serving, and
/// the answer is not sent until the port has actually been given back: a
/// caller told the service stopped is entitled to act on it. Reading the
/// password is on that thread for the same reason: it is a file, and this one is
/// the command that is already not allowed to hold up the interface.
#[tauri::command]
pub(crate) async fn close_share(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ShareStatus, AppError> {
    end_service(app, Arc::clone(&state.share)).await
}

/// Ends the service, and answers with what is left of it.
///
/// Two commands end it — the one that only ends it and the one that ends it and
/// closes the window (`commands::window`) — and everything about the ending is
/// the same in both: read the password that is in force, since a service holds
/// the one it started with, and wait on a blocking thread for the port to come
/// back. What differs is only what is done with the answer, so the answer is
/// what comes back here.
pub(crate) async fn end_service(
    app: AppHandle,
    share: Arc<crate::share::ShareControl>,
) -> Result<ShareStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let credentials = Credentials::load(&store::open(&app)?)?;
        Ok(share.close(&credentials, addresses::of_this_machine()))
    })
    .await
    .map_err(|error| AppError::new("share.stop_failed", error))?
}

/// What the interface is told about the service, asked from every page and from
/// the sharing page again on a timer.
///
/// The space is named by the caller like every other command's (ADR 0012), and
/// it is the one thing this command needs from the library: whether a running
/// service is still offering the list that space holds now. A service is ended
/// by switching spaces, so while one is running this is the space it belongs to
/// — and if that ever came apart, the answer would be a warning to restart,
/// which is true of a service offering the wrong list either way.
#[tauri::command]
pub(crate) fn share_status(
    space_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ShareStatus, AppError> {
    let credentials = Credentials::load(&store::open(&app)?)?;
    let paths = list_of(&state, space_id)?;
    Ok(state
        .share
        .status(&credentials, addresses::of_this_machine(), &paths))
}

/// Replaces the password, and answers with the sharing state that follows it.
///
/// The answer is the whole status rather than the password alone, because two
/// things about it have just changed: the password itself, and whether a service
/// that is running is still behind the one the interface would show. A caller
/// that had to ask again for the second would be able to draw the two
/// contradicting each other.
///
/// The space is read for the same reason `share_status` reads it: the answer is
/// the whole status, and a copy of it that dropped the list would be a page
/// losing a warning the moment the password is changed.
#[tauri::command]
pub(crate) fn regenerate_share_password(
    space_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ShareStatus, AppError> {
    let credentials = Credentials::regenerate(&store::open(&app)?)?;
    let paths = list_of(&state, space_id)?;
    Ok(state
        .share
        .status(&credentials, addresses::of_this_machine(), &paths))
}
