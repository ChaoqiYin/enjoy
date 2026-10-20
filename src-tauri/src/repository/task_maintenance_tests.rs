//! What the queue does when the application starts again: tasks an exit left
//! running go back to waiting, and finished tasks that have had their week
//! are removed.

use crate::model::TaskState;
use crate::repository::fixture::{Fixture, Library};
use crate::repository::now;

/// Puts a task row in with a given state and timestamps, without the queue's
/// own writes — the interrupted and the long-finished rows these two rules
/// are about are not reachable through the interface on purpose, so they are
/// laid down the way an earlier session would have left them.
fn insert(
    repository: &crate::repository::Repository,
    state: &str,
    available_at: i64,
    started_at: Option<i64>,
    finished_at: Option<i64>,
) -> i64 {
    repository
        .connection
        .execute(
            "INSERT INTO tasks (plugin,space_id,video_id,kind,payload,state,
                attempts,available_at,created_at,updated_at,started_at,finished_at)
             VALUES (NULL,1,NULL,'scan','{}',?1,2,?2,0,0,?3,?4)",
            rusqlite::params![state, available_at, started_at, finished_at],
        )
        .unwrap();
    repository.connection.last_insert_rowid()
}

#[test]
fn a_task_the_exit_interrupted_goes_back_to_waiting() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();
    let started_at = now() - 60_000;
    let id = insert(&repository, "running", started_at, Some(started_at), None);

    let before = now();
    repository.recover_tasks().unwrap();
    let after = now();

    let task = repository.task(id).unwrap();
    assert_eq!(task.state, TaskState::Pending);
    assert_eq!(
        task.attempts, 2,
        "an application exit is not a failed attempt"
    );
    assert!(
        (before..=after).contains(&task.available_at),
        "and the task is runnable again right away"
    );
    assert_eq!(
        task.started_at,
        Some(started_at),
        "when it first started is history, not something to erase"
    );
}

#[test]
fn recovery_leaves_every_other_state_alone() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();

    let pending = insert(&repository, "pending", 0, None, None);
    let paused = insert(&repository, "paused", 0, None, None);
    let done = insert(&repository, "done", 0, None, Some(now()));

    repository.recover_tasks().unwrap();

    assert_eq!(repository.task(pending).unwrap().state, TaskState::Pending);
    assert_eq!(repository.task(paused).unwrap().state, TaskState::Paused);
    assert_eq!(repository.task(done).unwrap().state, TaskState::Done);
}

#[test]
fn finished_tasks_that_are_over_a_week_old_are_removed() {
    let fixture = Fixture::new();
    let Library { mut repository, .. } = fixture.library();
    let week = 7 * 24 * 60 * 60 * 1000;
    let old_done = insert(&repository, "done", 0, None, Some(now() - week - 1));
    let old_failed = insert(&repository, "failed", 0, None, Some(now() - week - 1));
    let old_cancelled = insert(&repository, "cancelled", 0, None, Some(now() - week - 1));
    let recent = insert(&repository, "done", 0, None, Some(now() - 60_000));
    let waiting = insert(&repository, "pending", 0, None, None);

    repository.purge_finished_tasks().unwrap();

    for id in [old_done, old_failed, old_cancelled] {
        assert_eq!(
            repository.task(id).unwrap_err().code,
            "task.not_found",
            "every terminal state ages out the same way"
        );
    }
    assert_eq!(
        repository.task(recent).unwrap().state,
        TaskState::Done,
        "a week is the retention, not a deadline for today's work"
    );
    assert_eq!(
        repository.task(waiting).unwrap().state,
        TaskState::Pending,
        "unfinished tasks are never aged out"
    );
}
