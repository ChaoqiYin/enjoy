use crate::app::AppState;
use crate::error::AppError;
use crate::events::{AppEvents, Events};
use crate::model::{TaskAction, TaskRow};
use crate::repository::lock_shared;
use tauri::{AppHandle, State};

// The task page's two questions and its four actions. The read is every task
// in every space (spec #102 §8); each action is one repository write plus the
// one line that tells the page which row to read again — the page never
// patches a row itself, so what it draws is always the database's own answer
// (spec #102, acceptance 1 and 3).

#[tauri::command]
pub(crate) fn list_tasks(state: State<'_, AppState>) -> Result<Vec<TaskRow>, AppError> {
    lock_shared(&state.repository)?.list_tasks()
}

#[tauri::command]
pub(crate) fn task_action(
    task_id: i64,
    action: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), AppError> {
    act_on_task(&state, &AppEvents(app), task_id, &action)
}

/// Runs one of the task page's four actions, and tells the interface which
/// row moved when — and only when — the write went through.
///
/// Takes the state and the events rather than a `State` and an `AppHandle`
/// because both are things a test can hold: the action vocabulary and the
/// refusal it answers with are rules, and a rule reached only through a
/// window is a rule no test can check.
pub(crate) fn act_on_task(
    state: &AppState,
    events: &dyn Events,
    task_id: i64,
    action: &str,
) -> Result<(), AppError> {
    let action = TaskAction::parse(action)
        .ok_or_else(|| AppError::new("task.invalid_action", "No such task action"))?;
    lock_shared(&state.repository)?.apply_task_action(task_id, action)?;
    // A request written on the row has to reach the pass that is running that
    // very task: the row is where the request is recorded, and the pass is what
    // it stops. The kernel's own media tasks are run by a pass that waits at
    // its own checkpoint, so without this a 暂停 from this page would be a
    // mark on the row that nothing acted on (spec #101).
    state.scan.carry(task_id, action);
    events.task_changed(task_id);
    Ok(())
}
