use crate::app::AppState;
use crate::error::AppError;
use crate::model::Space;
use crate::repository::{lock_shared, Repository};
use tauri::State;

// The four commands that change which space is being shown, or the set of them,
// all answer the same question: which space is the interface showing now?
// Creating moves into the new one, removing moves out of the one that is gone,
// switching goes where it was told, and renaming a space that happens to be the
// current one answers with its new name. Keeping the answer the same shape is
// what lets the interface adopt it without asking, and so without a moment where
// it is showing a space that no longer exists.
//
// None of the four is refused while a media task runs. It used to be, through a
// single gate that read the scan slot; the slot's mutual exclusion moved into
// the queue (#101), and the reason the gate existed went with it: a task carries
// the space it was started on and writes where it meant to, so moving the
// window away changes nothing about where a running pass lands (ADR 0012).

/// Runs an operation that changes which space is being shown, or the set of them.
///
/// Takes the state rather than a `State<AppState>` so that the rule is reachable
/// from a test, and holds the four commands to the one shared way of reaching
/// the index.
pub(crate) fn changing_spaces<T>(
    state: &AppState,
    action: impl FnOnce(&mut Repository) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let mut repository = lock_shared(&state.repository)?;
    action(&mut repository)
}

#[tauri::command]
pub(crate) fn current_space(state: State<'_, AppState>) -> Result<Space, AppError> {
    lock_shared(&state.repository)?.current_space()
}

#[tauri::command]
pub(crate) fn list_spaces(state: State<'_, AppState>) -> Result<Vec<Space>, AppError> {
    lock_shared(&state.repository)?.spaces()
}

#[tauri::command]
pub(crate) fn create_space(name: String, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.create_space(&name))
}

#[tauri::command]
pub(crate) fn rename_space(
    space_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| {
        repository.rename_space(space_id, &name)
    })
}

#[tauri::command]
pub(crate) fn delete_space(space_id: i64, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.delete_space(space_id))
}

#[tauri::command]
pub(crate) fn switch_space(space_id: i64, state: State<'_, AppState>) -> Result<Space, AppError> {
    changing_spaces(&state, |repository| repository.switch_space(space_id))
}
