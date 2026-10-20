//! What a plugin can see and do of the queue: its own work, and only that.
//!
//! Every module here is driven the way a plugin would drive it — through the
//! six imports and nothing else — and what is asserted is what a plugin can
//! observe (its answers) plus the row in the library, which is where the user
//! sees the same task.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::plugins::runner::Runner;
use crate::repository::Repository;

use super::fixture::{body_on, library, logged, PLUGIN};

/// A module that queues one piece of its own work, then waits for it and
/// answers with the task as JSON.
const PUSHING_AND_WAITING: &str = r#"
    (module
      (import "enjoy" "task_push" (func $push (param i32 i32 i64 i64 i32 i32) (result i64)))
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "scrape")
      (data (i32.const 200) "{\"site\":\"example\"}")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (drop (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const -1) (i32.const 200) (i32.const 18)))
        (local.set $len (call $wait (i64.const 0) (i32.const 4096) (i32.const 1024)))
        (i64.or
          (i64.shl (i64.const 4096) (i64.const 32))
          (i64.extend_i32_u (local.get $len)))))
"#;

/// A module that queues the same work twice, and answers whether the two
/// pushes were given the same task.
const PUSHING_TWICE: &str = r#"
    (module
      (import "enjoy" "task_push" (func $push (param i32 i32 i64 i64 i32 i32) (result i64)))
      (memory (export "memory") 1)
      (data (i32.const 100) "scrape")
      (data (i32.const 200) "{}")
      (data (i32.const 300) "same")
      (data (i32.const 400) "diff")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $first i64)
        (local $second i64)
        (local.set $first (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const -1) (i32.const 200) (i32.const 2)))
        (local.set $second (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const -1) (i32.const 200) (i32.const 2)))
        (if (result i64) (i64.eq (local.get $first) (local.get $second))
          (then (i64.or (i64.shl (i64.const 300) (i64.const 32)) (i64.const 4)))
          (else (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 4))))))
"#;

/// A module that waits with nothing to wait for, and answers with what the
/// wait said.
const WAITING_ALONE: &str = r#"
    (module
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 400) "idle")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (local.set $len (call $wait (i64.const 250) (i32.const 4096) (i32.const 64)))
        (if (result i64) (i32.eqz (local.get $len))
          (then (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 4)))
          (else (i64.or (i64.shl (i64.const 4096) (i64.const 32)) (i64.extend_i32_u (local.get $len)))))))
"#;

/// A module that waits the way a background loop does: until the wait answers
/// with something that is not "nothing came".
const WAITING_FOREVER: &str = r#"
    (module
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 400) "stopped")
      (data (i32.const 500) "waited")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (block $out
          (loop $again
            (local.set $len (call $wait (i64.const 30000) (i32.const 4096) (i32.const 64)))
            (br_if $out (i32.ne (local.get $len) (i32.const 0)))))
        (if (result i64) (i32.eq (local.get $len) (i32.const -1))
          (then (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 7)))
          (else (i64.or (i64.shl (i64.const 500) (i64.const 32)) (i64.const 6))))))
"#;

/// A module that reaches for a task id it was handed, four ways, and answers
/// whether every one of them said no.
const REACHING_FOR_ANOTHERS: &str = r#"
    (module
      (import "enjoy" "task_progress" (func $progress (param i64 i64 i64 i32 i32) (result i32)))
      (import "enjoy" "task_checkpoint" (func $check (param i64) (result i32)))
      (import "enjoy" "task_done" (func $done (param i64 i32 i32) (result i32)))
      (import "enjoy" "task_fail" (func $fail (param i64 i32 i32 i64) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "refused")
      (data (i32.const 200) "oops")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $ok i32)
        (local.set $ok (i32.const 1))
        (local.set $ok (i32.and (local.get $ok)
          (i32.eq (call $progress (i64.const 1) (i64.const 1) (i64.const 2) (i32.const 0) (i32.const 0)) (i32.const -1))))
        (local.set $ok (i32.and (local.get $ok)
          (i32.eq (call $check (i64.const 1)) (i32.const -1))))
        (local.set $ok (i32.and (local.get $ok)
          (i32.eq (call $done (i64.const 1) (i32.const 0) (i32.const 0)) (i32.const -1))))
        (local.set $ok (i32.and (local.get $ok)
          (i32.eq (call $fail (i64.const 1) (i32.const 0) (i32.const 0) (i64.const -1)) (i32.const -1))))
        (if (result i64) (local.get $ok)
          (then (i64.or (i64.shl (i64.const 100) (i64.const 32)) (i64.const 7)))
          (else (i64.or (i64.shl (i64.const 200) (i64.const 32)) (i64.const 4))))))
"#;

/// A module that takes one task all the way: wait for it, report progress,
/// look at the checkpoint, and finish.
const RUNNING_ONE_THROUGH: &str = r#"
    (module
      (import "enjoy" "task_push" (func $push (param i32 i32 i64 i64 i32 i32) (result i64)))
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (import "enjoy" "task_progress" (func $progress (param i64 i64 i64 i32 i32) (result i32)))
      (import "enjoy" "task_checkpoint" (func $check (param i64) (result i32)))
      (import "enjoy" "task_done" (func $done (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "scrape")
      (data (i32.const 200) "{}")
      (data (i32.const 300) "half")
      (data (i32.const 400) "ok")
      (data (i32.const 500) "wrong")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $id i64)
        (local $ok i32)
        (local.set $id (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const -1) (i32.const 200) (i32.const 2)))
        (drop (call $wait (i64.const 0) (i32.const 8192) (i32.const 256)))
        (local.set $ok (i32.eq (call $progress (local.get $id) (i64.const 3) (i64.const 10) (i32.const 300) (i32.const 4)) (i32.const 0)))
        (local.set $ok (i32.and (local.get $ok) (i32.eq (call $check (local.get $id)) (i32.const 0))))
        (local.set $ok (i32.and (local.get $ok) (i32.eq (call $done (local.get $id) (i32.const 0) (i32.const 0)) (i32.const 0))))
        (if (result i64) (local.get $ok)
          (then (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 2)))
          (else (i64.or (i64.shl (i64.const 500) (i64.const 32)) (i64.const 5))))))
"#;

/// A module that reads the checkpoint of the task it is given as id 1, and
/// answers with the answer as one digit.
const CHECKPOINTING: &str = r#"
    (module
      (import "enjoy" "task_checkpoint" (func $check (param i64) (result i32)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i32.store8 (i32.const 4096) (i32.add (call $check (i64.const 1)) (i32.const 48)))
        (i64.or (i64.shl (i64.const 4096) (i64.const 32)) (i64.const 1))))
"#;

/// A module that takes one task and fails it, with the retry time substituted
/// into the text by the test that loads it.
const FAILING_ONE: &str = r#"
    (module
      (import "enjoy" "task_push" (func $push (param i32 i32 i64 i64 i32 i32) (result i64)))
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (import "enjoy" "task_fail" (func $fail (param i64 i32 i32 i64) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "scrape")
      (data (i32.const 200) "{}")
      (data (i32.const 300) "the site refused")
      (data (i32.const 400) "ok")
      (data (i32.const 500) "wrong")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $id i64)
        (local.set $id (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const -1) (i32.const 200) (i32.const 2)))
        (drop (call $wait (i64.const 0) (i32.const 8192) (i32.const 256)))
        (if (result i64) (i32.eq (call $fail (local.get $id) (i32.const 300) (i32.const 16) (RETRY)) (i32.const 0))
          (then (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 2)))
          (else (i64.or (i64.shl (i64.const 500) (i64.const 32)) (i64.const 5))))))
"#;

/// A retry time far enough in the future that it is never claimable in a test.
const RETRY_AT: i64 = 4_102_444_800_000; // 2100-01-01T00:00:00Z

#[test]
fn a_plugin_queues_its_own_work_and_waits_for_it() {
    let library = library();
    let body = body_on(PUSHING_AND_WAITING, &library).unwrap();
    // The whole shape of the answer a plugin works from: the work's own
    // description, where it has got to, and nothing of the kernel's
    // bookkeeping. The exact bytes are the specification — a plugin parses
    // this, so what is in it (and what is not) is a promise.
    assert_eq!(
        body.handle("video.fields", "{}").unwrap(),
        r#"{"id":1,"kind":"scrape","space_id":1,"video_id":null,"payload":"{\"site\":\"example\"}","state":"running","attempts":1,"progress_current":null,"progress_total":null,"progress_label":null,"last_error":null}"#
    );
    // And the row the user's task page reads is the same task, owned by this
    // plugin and no other.
    let task = library.lock().unwrap().task(1).unwrap();
    assert_eq!(task.plugin.as_deref(), Some(PLUGIN));
    assert_eq!(task.kind, "scrape");
    assert_eq!(task.state, crate::model::TaskState::Running);
    assert_eq!(task.attempts, 1);
}

#[test]
fn the_same_work_pushed_twice_is_one_task() {
    let library = library();
    let body = body_on(PUSHING_TWICE, &library).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "same");
    // One row, not two: the second click's payload is dropped and its id is
    // the first's. Nothing was claimed, so the single row is still waiting.
    let mut repository = library.lock().unwrap();
    assert_eq!(repository.task(1).unwrap().kind, "scrape");
    assert!(repository.task(2).is_err(), "a second row was queued");
    let claimed = repository.claim_task(Some(PLUGIN)).unwrap();
    assert_eq!(claimed.map(|task| task.id), Some(1));
    assert!(repository.claim_task(Some(PLUGIN)).unwrap().is_none());
}

#[test]
fn a_wait_with_nothing_to_do_comes_back_after_its_timeout() {
    let library = library();
    let body = body_on(WAITING_ALONE, &library).unwrap();
    let started = Instant::now();
    let answer = body.handle("video.fields", "{}").unwrap();
    let took = started.elapsed();
    // An idle wait is an answer too: "nothing came". It arrives after the
    // timeout the caller named, not before and not at the call's deadline —
    // the plugin chooses how long a pause it is asking for.
    assert_eq!(answer, "idle");
    assert!(took >= Duration::from_millis(250), "{took:?}");
    assert!(took < Duration::from_secs(2), "{took:?}");
}

#[test]
fn stopping_the_queue_wakes_a_wait_that_would_otherwise_never_end() {
    let library = library();
    let body = body_on(WAITING_FOREVER, &library).unwrap();
    let waker = Arc::clone(&body);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        waker.stop();
    });
    let started = Instant::now();
    let answer = body.handle("video.fields", "{}").unwrap();
    let took = started.elapsed();
    // The wait asked for thirty seconds and came back in a fraction of one:
    // the stop is the answer, and it is the answer a `until task_wait(…) == -1`
    // loop needs in order to exit.
    assert_eq!(answer, "stopped");
    assert!(took < Duration::from_secs(2), "{took:?}");
}

#[test]
fn a_plugin_cannot_touch_a_task_that_is_not_its_own() {
    let logged = logged();
    let library = library();
    // Somebody else's task, queued and claimed under another plugin's name —
    // the id is the one this test's module reaches for.
    let mut repository = library.lock().unwrap();
    repository
        .push_task(Some("com.example.other"), 1, None, "work", "{}")
        .unwrap();
    repository.claim_task(Some("com.example.other")).unwrap();
    drop(repository);
    let body = body_on(REACHING_FOR_ANOTHERS, &library).unwrap();
    // Every one of the four verbs said no, and the call itself was an answer,
    // not a failure: a plugin that asks is told "no", it is not thrown out.
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "refused");
    // The row is exactly as the other plugin left it — nothing written, not
    // even a progress mark.
    let task = library.lock().unwrap().task(1).unwrap();
    assert_eq!(task.plugin.as_deref(), Some("com.example.other"));
    assert_eq!(task.state, crate::model::TaskState::Running);
    assert_eq!(task.attempts, 1);
    assert_eq!(task.progress_current, None);
    assert_eq!(task.finished_at, None);
    // And a user reading the log can tell whose plugin reached for it.
    let logged = logged.lock().unwrap().clone();
    assert!(logged.contains("not its own"), "{logged}");
    assert!(logged.contains(PLUGIN), "{logged}");
    assert!(logged.contains('1'), "{logged}");
}

#[test]
fn a_plugin_reports_progress_and_finishes_its_own_task() {
    let library = library();
    let body = body_on(RUNNING_ONE_THROUGH, &library).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "ok");
    let task = library.lock().unwrap().task(1).unwrap();
    assert_eq!(task.state, crate::model::TaskState::Done);
    assert_eq!(task.progress_current, Some(3));
    assert_eq!(task.progress_total, Some(10));
    assert_eq!(task.progress_label.as_deref(), Some("half"));
    assert_eq!(task.attempts, 1);
    assert!(task.finished_at.is_some());
}

#[test]
fn a_pause_and_a_cancel_reach_the_plugin_at_its_checkpoint() {
    let library = library();
    let mut repository = library.lock().unwrap();
    let id = repository
        .push_task(Some(PLUGIN), 1, None, "work", "{}")
        .unwrap();
    repository.claim_task(Some(PLUGIN)).unwrap();
    // The task page's 暂停, while the task is running: the state stays and the
    // request is a mark the checkpoint reports.
    repository.request_task_pause(id).unwrap();
    drop(repository);
    let body = body_on(CHECKPOINTING, &library).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "1");
    // Then 取消, which outranks the pause still standing beside it: the answer
    // a plugin cannot resume from is the safer one to give.
    library.lock().unwrap().request_task_cancel(id).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "2");
}

#[test]
fn a_failure_with_a_retry_time_goes_back_to_waiting_for_it() {
    let source = FAILING_ONE.replace("(RETRY)", &format!("(i64.const {RETRY_AT})"));
    let library = library();
    let body = body_on(&source, &library).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "ok");
    let mut repository = library.lock().unwrap();
    let task = repository.task(1).unwrap();
    assert_eq!(task.state, crate::model::TaskState::Pending);
    assert_eq!(task.available_at, RETRY_AT);
    assert_eq!(task.last_error.as_deref(), Some("the site refused"));
    // And the queue agrees: the task is waiting for its time, not for now.
    assert!(repository.claim_task(Some(PLUGIN)).unwrap().is_none());
}

#[test]
fn a_failure_without_a_retry_time_is_terminal() {
    let source = FAILING_ONE.replace("(RETRY)", "(i64.const -1)");
    let library = library();
    let body = body_on(&source, &library).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "ok");
    let task = library.lock().unwrap().task(1).unwrap();
    assert_eq!(task.state, crate::model::TaskState::Failed);
    assert_eq!(task.last_error.as_deref(), Some("the site refused"));
    assert!(task.finished_at.is_some());
}

/// The lock two tests hold while a body is running against the same library
/// is the same one the plugin's own thread takes — so these tests never hold
/// it across a `handle`. This assertion exists to keep that habit visible.
#[test]
fn the_library_is_reachable_while_a_body_runs_against_it() {
    let library: Arc<Mutex<Repository>> = library();
    let body = body_on(WAITING_ALONE, &library).unwrap();
    // The body's thread holds nothing while it waits; this lock is taken and
    // dropped with the wait already parked.
    drop(library.lock().unwrap());
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "idle");
}
