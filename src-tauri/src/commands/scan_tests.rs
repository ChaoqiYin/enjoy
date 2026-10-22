//! The three media commands, as the command layer runs them: each one puts a
//! task in the queue and answers with its id, and the status bar's action
//! reaches both the queue and the pass that is running.

use super::scan::{act_on_scan, queue_refresh, queue_scan, queue_thumbnails};
use super::tasks::act_on_task;
use crate::app::{test_state, AppState};
use crate::events::Recorded;
use crate::model::TaskState;
use crate::repository::fixture::{video_fields, Fixture, Library};
use crate::repository::lock_shared;

/// The one space a new library holds.
fn space(state: &AppState) -> i64 {
    lock_shared(&state.repository)
        .unwrap()
        .current_space()
        .unwrap()
        .id
}

/// A library with one video in it, for the tasks that are about a file.
///
/// The video is laid down through the fixture's own helper, so it is a record
/// of the library like any other rather than a row only this file can write.
fn library_with_a_video() -> (Fixture, AppState, i64) {
    let fixture = Fixture::new();
    let Library {
        mut repository,
        space,
    } = fixture.library();
    video_fields(
        &mut repository,
        &[(7, "title", "A video", "com.example.one")],
    );
    let state = test_state(&fixture);
    (fixture, state, space)
}

/// Claims the row and begins the pass that runs it — the two things the
/// kernel's owner does, in that order, before any work happens.
fn begin_the_task(state: &AppState, id: i64) -> crate::scan::control::ScanGuard {
    lock_shared(&state.repository)
        .unwrap()
        .claim_task(None)
        .unwrap();
    state.scan.begin_task(id)
}

/// The path the fixture's video is stored under.
const THE_VIDEO: &str = "/videos/7.mkv";

#[test]
fn a_scan_is_queued_and_answers_with_the_task_s_id() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);

    let id = queue_scan(&state, space(&state)).unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.kind, "scan");
    assert_eq!(task.state, TaskState::Pending);
    assert_eq!(task.plugin, None);
    // The task carries the space it was started on: a pass writes where it
    // meant to, even if the user has moved the window to another space since
    // (ADR 0012).
    assert_eq!(task.space_id, space(&state));
}

#[test]
fn a_scan_asked_for_twice_is_one_task_in_the_queue() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);

    let first = queue_scan(&state, space(&state)).unwrap();
    let second = queue_scan(&state, space(&state)).unwrap();

    assert_eq!(first, second);
}

#[test]
fn a_thumbnail_sweep_is_queued_for_the_whole_space() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);

    let id = queue_thumbnails(&state, space(&state), None).unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.kind, "thumbnails");
    assert_eq!(task.video_id, None);
}

#[test]
fn a_thumbnail_of_one_file_is_named_by_that_file() {
    let (_fixture, state, space) = library_with_a_video();

    let id = queue_thumbnails(&state, space, Some(THE_VIDEO.into())).unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.kind, "thumbnails");
    assert_eq!(task.video_id, Some(7));
    // The payload is what the owner reads to know which file the pass is about.
    assert!(task.payload.contains(THE_VIDEO));
}

#[test]
fn a_refresh_is_queued_for_the_file_it_names() {
    let (_fixture, state, space) = library_with_a_video();

    let id = queue_refresh(&state, space, THE_VIDEO).unwrap();

    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert_eq!(task.kind, "refresh");
    assert_eq!(task.video_id, Some(7));
    assert!(task.payload.contains(THE_VIDEO));
}

#[test]
fn the_status_bar_s_pause_reaches_the_pass_and_the_row() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);

    act_on_scan(&state, &Recorded::default(), "pause").unwrap();

    // The pass is what the user is looking at, and the row is what the task
    // page shows. A request that reached only one of them would leave the two
    // saying different things about the same work.
    assert_eq!(state.scan.status().phase, "paused");
    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert!(task.pause_requested);
    assert_eq!(task.state, TaskState::Running);
}

#[test]
fn the_status_bar_s_cancel_reaches_the_pass_and_the_row() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);

    act_on_scan(&state, &Recorded::default(), "cancel").unwrap();

    assert_eq!(
        state.scan.checkpoint().unwrap_err().code,
        "media.scan.cancelled"
    );
    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert!(task.cancel_requested);
}

#[test]
fn the_task_page_s_pause_reaches_the_pass_that_is_running_it() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);

    act_on_task(&state, &Recorded::default(), id, "pause").unwrap();

    // Without this the page's 暂停 would be a mark on the row that nothing
    // acted on: the pass waits at its own checkpoint, and the mark is not
    // something it reads.
    assert_eq!(state.scan.status().phase, "paused");
    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert!(task.pause_requested);
}

#[test]
fn the_task_page_s_cancel_reaches_the_pass_that_is_running_it() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);

    act_on_task(&state, &Recorded::default(), id, "cancel").unwrap();

    assert_eq!(
        state.scan.checkpoint().unwrap_err().code,
        "media.scan.cancelled"
    );
}

#[test]
fn the_task_page_s_continue_reaches_the_pass_that_is_waiting() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);
    act_on_task(&state, &Recorded::default(), id, "pause").unwrap();

    act_on_task(&state, &Recorded::default(), id, "resume").unwrap();

    assert_eq!(state.scan.status().phase, "discovering");
    let task = lock_shared(&state.repository).unwrap().task(id).unwrap();
    assert!(!task.pause_requested);
    assert_eq!(task.state, TaskState::Running);
}

#[test]
fn a_pause_the_row_already_carries_is_the_same_request_and_not_a_refusal() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);
    act_on_scan(&state, &Recorded::default(), "pause").unwrap();

    // The same request asked for twice — once from the status bar and once from
    // the task page — is one request, not the second one a fault.
    act_on_scan(&state, &Recorded::default(), "pause").unwrap();

    assert_eq!(state.scan.status().phase, "paused");
}

#[test]
fn an_action_the_scan_has_never_heard_of_is_refused_by_its_word() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);

    let refused = act_on_scan(&state, &Recorded::default(), "destroy").unwrap_err();

    assert_eq!(refused.code, "media.scan.invalid_action");
}

#[test]
fn the_status_bar_s_action_tells_the_interface_which_row_moved() {
    let fixture = Fixture::new();
    let state = test_state(&fixture);
    let id = queue_scan(&state, space(&state)).unwrap();
    let _running = begin_the_task(&state, id);
    let events = Recorded::default();

    act_on_scan(&state, &events, "pause").unwrap();

    assert_eq!(events.task_changes(), vec![id]);
}
