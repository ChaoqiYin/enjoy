//! What an owner reports about the task it is running: progress while the
//! work stands, and the two ways an attempt ends — with the work done, or
//! with a failure that either waits to be retried or finishes the task.

use crate::model::{TaskSignal, TaskState};
use crate::repository::fixture::{Fixture, Library};
use crate::repository::Repository;

/// A task claimed and ready to be reported on, which is the state every test
/// in this file starts from: progress and completion are things an owner says
/// about work it is doing.
fn running(repository: &mut Repository) -> i64 {
    let space = repository.current_space().unwrap().id;
    let id = repository.push_task(None, space, None, "scan", "{}").unwrap();
    let claimed = repository.claim_task(None).unwrap().unwrap();
    assert_eq!(claimed.id, id);
    id
}

fn error_code(result: Result<(), crate::error::AppError>) -> String {
    result.unwrap_err().code
}

#[test]
fn progress_lands_on_a_running_task() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository
        .set_task_progress(id, 3, Some(12), Some("正在请求"))
        .unwrap();

    let task = repository.task(id).unwrap();
    assert_eq!(task.progress_current, Some(3));
    assert_eq!(task.progress_total, Some(12));
    assert_eq!(task.progress_label.as_deref(), Some("正在请求"));
}

#[test]
fn progress_after_the_attempt_is_over_is_refused() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);
    repository.complete_task(id).unwrap();

    let refused = repository.set_task_progress(id, 1, None, None);

    assert_eq!(error_code(refused), "task.invalid_state");
}

#[test]
fn progress_on_a_task_that_does_not_exist_says_so() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();

    let refused = repository.set_task_progress(404, 1, None, None);

    assert_eq!(error_code(refused), "task.not_found");
}

#[test]
fn finishing_marks_the_task_done_and_stamps_the_end() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);
    let claimed = repository.task(id).unwrap();

    repository.complete_task(id).unwrap();

    let task = repository.task(id).unwrap();
    assert_eq!(task.state, TaskState::Done);
    assert!(
        task.finished_at.is_some(),
        "the task page orders finished tasks by when they finished"
    );
    assert_eq!(
        task.attempts, claimed.attempts,
        "finishing is not another attempt"
    );
}

#[test]
fn a_task_that_was_never_claimed_cannot_be_finished() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = repository.push_task(None, space, None, "scan", "{}").unwrap();

    let refused = repository.complete_task(id);

    assert_eq!(error_code(refused), "task.invalid_state");
}

#[test]
fn a_failure_without_a_retry_time_is_terminal() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository.fail_task(id, "无法从文件名识别番号", None).unwrap();

    let task = repository.task(id).unwrap();
    assert_eq!(task.state, TaskState::Failed);
    assert_eq!(task.last_error.as_deref(), Some("无法从文件名识别番号"));
    assert!(task.finished_at.is_some());
    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "a terminal failure is not runnable"
    );
}

#[test]
fn a_failure_with_a_retry_time_goes_back_to_waiting() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);
    let retry_at = crate::repository::now() + 5_000;

    repository
        .fail_task(id, "站点超时，稍后重试", Some(retry_at))
        .unwrap();

    let task = repository.task(id).unwrap();
    assert_eq!(task.state, TaskState::Pending);
    assert_eq!(
        task.available_at, retry_at,
        "the retry is scheduled for the time the owner asked for"
    );
    assert_eq!(
        task.last_error.as_deref(),
        Some("站点超时，稍后重试"),
        "why the last attempt failed stays readable"
    );
    assert_eq!(task.finished_at, None, "and the task is not finished");
    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "not runnable before its time"
    );
}

#[test]
fn a_scheduled_failure_can_be_claimed_again_when_its_time_comes() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository
        .fail_task(id, "站点超时", Some(crate::repository::now() - 1))
        .unwrap();

    let claimed = repository.claim_task(None).unwrap().unwrap();
    assert_eq!(claimed.id, id);
    assert_eq!(claimed.state, TaskState::Running);
    assert_eq!(
        claimed.attempts, 2,
        "the retry is a second attempt, not a new task"
    );
}

#[test]
fn pausing_a_queued_task_moves_it_now() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = repository.push_task(None, space, None, "scan", "{}").unwrap();

    repository.request_task_pause(id).unwrap();

    assert_eq!(repository.task(id).unwrap().state, TaskState::Paused);
    assert!(
        repository.claim_task(None).unwrap().is_none(),
        "a paused task is out of the queue"
    );
}

#[test]
fn pausing_a_running_task_is_carried_out_at_the_checkpoint() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository.request_task_pause(id).unwrap();

    let marked = repository.task(id).unwrap();
    assert_eq!(
        marked.state,
        TaskState::Running,
        "a running task is not preempted; the request waits for it"
    );
    assert!(marked.pause_requested);
    assert_eq!(
        repository.task_checkpoint(id).unwrap(),
        TaskSignal::Pause,
        "and the checkpoint is where it is seen"
    );
    assert_eq!(
        repository.task_checkpoint(id).unwrap(),
        TaskSignal::Pause,
        "the answer stays put until the state moves"
    );

    repository.apply_task_pause(id).unwrap();
    let paused = repository.task(id).unwrap();
    assert_eq!(paused.state, TaskState::Paused);
    assert!(!paused.pause_requested, "the request has been acted on");
}

#[test]
fn a_paused_task_can_be_resumed_and_claimed_again() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);
    repository.request_task_pause(id).unwrap();
    repository.apply_task_pause(id).unwrap();

    repository.resume_task(id).unwrap();

    let claimed = repository.claim_task(None).unwrap().unwrap();
    assert_eq!(claimed.id, id);
    assert_eq!(claimed.state, TaskState::Running);
    assert_eq!(claimed.attempts, 2, "resuming is another attempt at the work");
}

#[test]
fn resuming_a_task_that_is_not_paused_is_refused() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    let id = repository.push_task(None, space, None, "scan", "{}").unwrap();

    let refused = repository.resume_task(id);

    assert_eq!(error_code(refused), "task.invalid_state");
}

#[test]
fn cancelling_a_queued_or_paused_task_finishes_it_now() {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();

    let queued = repository.push_task(None, space, None, "scan", "{}").unwrap();
    repository.request_task_cancel(queued).unwrap();
    let cancelled = repository.task(queued).unwrap();
    assert_eq!(cancelled.state, TaskState::Cancelled);
    assert!(cancelled.finished_at.is_some());

    let paused = repository.push_task(None, space, None, "scan", "{}").unwrap();
    repository.request_task_pause(paused).unwrap();
    repository.request_task_cancel(paused).unwrap();
    assert_eq!(
        repository.task(paused).unwrap().state,
        TaskState::Cancelled,
        "a paused task has no checkpoint to wait for"
    );
}

#[test]
fn cancelling_a_running_task_is_carried_out_at_the_checkpoint() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository.request_task_cancel(id).unwrap();

    let marked = repository.task(id).unwrap();
    assert_eq!(marked.state, TaskState::Running, "not preempted");
    assert!(marked.cancel_requested);
    assert_eq!(repository.task_checkpoint(id).unwrap(), TaskSignal::Cancel);

    repository.apply_task_cancel(id).unwrap();
    let done = repository.task(id).unwrap();
    assert_eq!(done.state, TaskState::Cancelled);
    assert!(done.finished_at.is_some());
    assert!(!done.cancel_requested);
}

#[test]
fn the_checkpoint_says_run_when_nothing_was_asked() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    assert_eq!(repository.task_checkpoint(id).unwrap(), TaskSignal::Run);
}

#[test]
fn a_cancel_outranks_a_pause_when_both_were_asked() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    repository.request_task_pause(id).unwrap();
    repository.request_task_cancel(id).unwrap();

    assert_eq!(
        repository.task_checkpoint(id).unwrap(),
        TaskSignal::Cancel,
        "the answer that cannot be resumed from is the safer one to honour"
    );
}

#[test]
fn retrying_a_terminal_failure_clears_the_error_and_makes_it_runnable() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);
    repository.fail_task(id, "站点页面结构可能变了", None).unwrap();

    repository.retry_task(id).unwrap();

    let retried = repository.task(id).unwrap();
    assert_eq!(retried.state, TaskState::Pending);
    assert_eq!(retried.last_error, None, "the retry is a fresh question");
    assert_eq!(retried.finished_at, None);
    assert_eq!(
        repository.claim_task(None).unwrap().unwrap().id,
        id,
        "and it is at the front of the queue now"
    );
}

#[test]
fn retrying_a_task_that_did_not_fail_is_refused() {
    let fixture = Fixture::new();
    let Library {
        mut repository, ..
    } = fixture.library();
    let id = running(&mut repository);

    let refused = repository.retry_task(id);

    assert_eq!(error_code(refused), "task.invalid_state");
}
