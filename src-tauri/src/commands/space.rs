use crate::app::AppState;
use crate::error::AppError;
use crate::model::Space;
use crate::repository::{lock_shared, Repository};
use crate::scan::control::space_change_gate;
use tauri::State;

// The four commands that change which space is being shown, or the set of them,
// all answer the same question: which space is the interface showing now?
// Creating moves into the new one, removing moves out of the one that is gone,
// switching goes where it was told, and renaming a space that happens to be the
// current one answers with its new name. Keeping the answer the same shape is
// what lets the interface adopt it without asking, and so without a moment where
// it is showing a space that no longer exists.
//
// All four are refused while a media task holds the scan slot, for the reason
// written on `space_change_gate`, and all four ask that through `changing_spaces`
// rather than each asking for itself. The interface disables them too, but that
// is only ever an explanation: the rule is the one in that function, and it is
// the one that holds.

/// Runs an operation that changes which space is being shown, or the set of them.
///
/// One gate, asked in one place, is a gate that cannot be left out of one of the
/// four by accident — which is the shape this rule wants, since the four are the
/// same rule asked four times.
///
/// Takes the state rather than a `State<AppState>` so that the rule is reachable
/// from a test: the four commands below are the only production callers, and a
/// fifth that forgot to ask is the failure this is shaped to prevent.
pub(crate) fn changing_spaces<T>(
    state: &AppState,
    action: impl FnOnce(&mut Repository) -> Result<T, AppError>,
) -> Result<T, AppError> {
    space_change_gate(state.scan.is_running())?;
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
