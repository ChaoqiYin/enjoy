//! The kernel's queue owner: it claims one task, runs it, and writes how it
//! ended.
//!
//! What these tests are about is the queue's own bookkeeping — the claim, the
//! ending, and what the interface is told — not the work inside a pass, which
//! the media and scan modules have tests of their own for.

use std::sync::Arc;

use crate::app::{test_state, AppState};
use crate::events::Recorded;
use crate::media::MediaProcessor;
use crate::model::{TaskAction, TaskState};
use crate::plugins::NoPlugins;
use crate::repository::fixture::Fixture;
use crate::repository::lock_shared;
use crate::tasks::Runner;

/// An owner over the state the test holds, with the events it reports into.
fn owner(state: &AppState, events: Arc<Recorded>) -> Runner {
    Runner::new(
        Arc::clone(&state.repository),
        Arc::clone(&state.scan),
        events,
        Arc::new(NoPlugins),
        Box::new(|| Ok(MediaProcessor::on_path(std::env::temp_dir()))),
    )
}

/// The one space a new library holds.
fn space(state: &AppState) -> i64 {
    lock_shared(&state.repository)
        .unwrap()
        .current_space()
        .unwrap()
        .id
}

#[test]
fn a_queued_scan_is_claimed_run_and_left_done() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = space(&state);
    let id = lock_shared(&state.repository)
        .unwrap()
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    let events = Arc::new(Recorded::default());
    let owner = owner(&state, Arc::clone(&events));

    assert!(owner.once().unwrap());

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Done);
    // Told twice: once when the task was claimed, once when it ended. The task
    // page draws a row that has moved, and a claim is a move.
    assert_eq!(events.task_changes(), vec![id, id]);
}

#[test]
fn a_plugin_s_own_task_is_not_the_kernel_s_to_run() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = space(&state);
    lock_shared(&state.repository)
        .unwrap()
        .push_task(Some("com.example.one"), space, None, "scrape", "{}")
        .unwrap();
    let owner = owner(&state, Arc::new(Recorded::default()));

    // The owner holds the kernel's queue and nothing else: a plugin's own
    // tasks are run by the plugin's host, which is a different lane.
    assert!(!owner.once().unwrap());
}

#[test]
fn a_task_the_owner_cannot_carry_out_ends_as_a_failure_that_says_why() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = space(&state);
    let id = lock_shared(&state.repository)
        .unwrap()
        .push_task(None, space, None, "transcribe", "{}")
        .unwrap();
    let events = Arc::new(Recorded::default());
    let owner = owner(&state, Arc::clone(&events));

    owner.once().unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Failed);
    assert_eq!(task.last_error.as_deref(), Some("task.unknown_kind"));
    // The user watching the library deserves to be told why nothing moved: the
    // task page's row is not where they are looking.
    assert_eq!(events.media_error_codes(), vec!["task.unknown_kind"]);
}

#[test]
fn a_task_the_user_cancelled_ends_as_cancelled_and_not_as_a_failure() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = space(&state);
    let id = lock_shared(&state.repository)
        .unwrap()
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    // The user cancels while the task is waiting: the row says so before the
    // owner ever reaches it.
    lock_shared(&state.repository)
        .unwrap()
        .request_task_cancel(id)
        .unwrap();
    let owner = owner(&state, Arc::new(Recorded::default()));

    // The cancelled task is not claimed at all — it is not waiting any more —
    // so the owner has nothing to do.
    assert!(!owner.once().unwrap());

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Cancelled);
}

#[test]
fn a_cancel_that_arrives_while_the_task_runs_is_what_the_row_says_at_the_end() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let space = space(&state);
    let id = lock_shared(&state.repository)
        .unwrap()
        .push_task(None, space, None, "scan", "{}")
        .unwrap();
    // The cancel arrives while the pass is running. The hook runs as the pass
    // reports, which is the only moment a test can be inside one — and the
    // request is written on the row and carried into the pass, exactly as the
    // task page's own 取消 does it.
    let repository = Arc::clone(&state.repository);
    let control = Arc::clone(&state.scan);
    let asked = std::sync::atomic::AtomicBool::new(false);
    let events = Arc::new(Recorded::default().watching(move |_status| {
        if asked.swap(true, std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        lock_shared(&repository)
            .unwrap()
            .request_task_cancel(id)
            .unwrap();
        control.carry(id, TaskAction::Cancel);
    }));
    let owner = owner(&state, Arc::clone(&events));

    owner.once().unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Cancelled);
    assert!(!task.cancel_requested);
}
