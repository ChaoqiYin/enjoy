//! The task page's four actions, as the command layer runs them: the write
//! goes through, and the interface is told which row to read again.

use super::tasks::act_on_task;
use crate::app::test_state;
use crate::error::AppError;
use crate::events::Recorded;
use crate::model::TaskState;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;

/// Queues one task for the fixture's only space and answers with its id.
fn queued(state: &crate::app::AppState, kind: &str) -> i64 {
    let mut repository = lock_shared(&state.repository).unwrap();
    let space = repository.current_space().unwrap().id;
    repository.push_task(None, space, None, kind, "{}").unwrap()
}

#[test]
fn pause_moves_a_waiting_task_out_of_the_queue_now() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");

    act_on_task(&state, &Recorded::default(), id, "pause").unwrap();

    let repository = lock_shared(&state.repository).unwrap();
    assert_eq!(repository.task(id).unwrap().state, TaskState::Paused);
}

#[test]
fn pause_marks_a_running_task_instead_of_stopping_it() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    lock_shared(&state.repository)
        .unwrap()
        .claim_task(None)
        .unwrap();

    act_on_task(&state, &Recorded::default(), id, "pause").unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Running);
    assert!(task.pause_requested);
}

#[test]
fn resume_puts_a_paused_task_back_to_waiting() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    act_on_task(&state, &Recorded::default(), id, "pause").unwrap();

    act_on_task(&state, &Recorded::default(), id, "resume").unwrap();

    let repository = lock_shared(&state.repository).unwrap();
    assert_eq!(repository.task(id).unwrap().state, TaskState::Pending);
}

#[test]
fn cancel_removes_a_waiting_task_now() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");

    act_on_task(&state, &Recorded::default(), id, "cancel").unwrap();

    let repository = lock_shared(&state.repository).unwrap();
    assert_eq!(repository.task(id).unwrap().state, TaskState::Cancelled);
}

#[test]
fn cancel_marks_a_running_task_for_its_next_checkpoint() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    lock_shared(&state.repository)
        .unwrap()
        .claim_task(None)
        .unwrap();

    act_on_task(&state, &Recorded::default(), id, "cancel").unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Running);
    assert!(task.cancel_requested);
}

#[test]
fn retry_brings_a_terminal_failure_back_and_clears_the_reason() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    {
        let mut repository = lock_shared(&state.repository).unwrap();
        repository.claim_task(None).unwrap();
        repository.fail_task(id, "network refused", None).unwrap();
    }

    act_on_task(&state, &Recorded::default(), id, "retry").unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Pending);
    assert_eq!(task.last_error, None);
}

#[test]
fn every_successful_action_tells_the_interface_which_row_to_read_again() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    let events = Recorded::default();

    act_on_task(&state, &events, id, "pause").unwrap();

    assert_eq!(events.task_changes(), vec![id]);
}

#[test]
fn an_action_refused_tells_the_interface_nothing() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    let events = Recorded::default();
    // Paused is not a state the pause can move: the second ask is refused.
    act_on_task(&state, &events, id, "pause").unwrap();

    let refused = act_on_task(&state, &events, id, "pause").unwrap_err();

    assert_eq!(refused.code, "task.invalid_state");
    assert_eq!(
        events.task_changes(),
        vec![id],
        "the refused ask adds no second re-read after the one the first pause earned"
    );
}

#[test]
fn a_retry_that_would_not_run_is_refused_as_a_state_not_a_queue_fault() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");

    let refused = act_on_task(&state, &Recorded::default(), id, "retry").unwrap_err();

    assert_eq!(refused.code, "task.invalid_state");
}

#[test]
fn an_action_this_build_has_never_heard_of_is_refused_by_its_word() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");

    let refused = act_on_task(&state, &Recorded::default(), id, "destroy").unwrap_err();

    assert_eq!(refused.code, "task.invalid_action");
}

#[test]
fn an_action_on_a_task_that_is_gone_says_so() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);

    let refused = act_on_task(&state, &Recorded::default(), 99, "pause").unwrap_err();

    assert_eq!(refused.code, "task.not_found");
}

#[test]
fn the_action_layer_wraps_a_repository_verdict_without_changing_it() {
    // The command answers with the repository's own error, so the words the
    // user reads for a bad state are written from one code rather than two.
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queued(&state, "scan");
    let error: AppError = act_on_task(&state, &Recorded::default(), id, "resume").unwrap_err();
    assert_eq!(error.code, "task.invalid_state");
}
