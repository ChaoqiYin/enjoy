//! What the second instance is for: a plugin that exports `run` gets a thread
//! that works on its own time, and one that does not gets nothing extra.
//!
//! Every module here is loaded the way a real body is — through
//! [`super::fixture`], on a library the test keeps — and what is asserted is
//! what a user could observe: a task moving through the queue because a
//! background loop claimed it, a front mount point still answering after the
//! background has died, and a switch-off that leaves no thread running.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::model::TaskState;
use crate::plugins::runner::{Runner, RunnerError};
use crate::repository::Repository;

use super::fixture::{body_on, library, logged, serving, silent, slow, PLUGIN};

/// A module whose front half queues work and whose `run` is a background loop:
/// wait for one of its tasks, finish it, and go back to waiting until the host
/// stops it.
///
/// The loop is exactly the one a real plugin writes — `until task_wait(…) == -1`
/// — and it is here rather than in prose because that is the shape the second
/// instance exists to make possible. The push comes from the front instance, the
/// way a menu item's does (spec #96 §10), which is also what wakes a background
/// that is already parked: the queue's wakeup is a host-call fact, not a
/// repository one. The task it finishes is always id `1`, which is the id the
/// test's single push gets in a fresh library.
const RUNNING_THE_QUEUE: &str = r#"
    (module
      (import "enjoy" "task_push" (func $push (param i32 i32 i64 i64 i32 i32) (result i64)))
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (import "enjoy" "task_done" (func $done (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "scrape")
      (data (i32.const 200) "{}")
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "run")
        (local $len i32)
        (block $out
          (loop $again
            (local.set $len (call $wait (i64.const 30000) (i32.const 4096) (i32.const 256)))
            (br_if $out (i32.eq (local.get $len) (i32.const -1)))
            (br_if $again (i32.eq (local.get $len) (i32.const 0)))
            (drop (call $done (i64.const 1) (i32.const 0) (i32.const 0)))
            (br $again))))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (drop (call $push (i32.const 100) (i32.const 6) (i64.const 1) (i64.const 0) (i32.const 200) (i32.const 2)))
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// The same body with no `run` exported: the front half is identical, and the
/// whole difference is the one function that is not there.
const WITHOUT_RUN: &str = r#"
    (module
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (import "enjoy" "task_done" (func $done (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` returns at once: the background starts and is over.
const RETURNING: &str = r#"
    (module
      (memory (export "memory") 1)
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "run"))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` traps: the background dies, and the front must not.
const TRAPPING: &str = r#"
    (module
      (memory (export "memory") 1)
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "run") (unreachable))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` parks in a `task_wait` far longer than any test waits,
/// so that only a stop can bring it back.
const SLEEPING: &str = r#"
    (module
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "run")
        (local $len i32)
        (block $out
          (loop $again
            (local.set $len (call $wait (i64.const 30000) (i32.const 4096) (i32.const 256)))
            (br_if $out (i32.eq (local.get $len) (i32.const -1)))
            (br $again))))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` asks the kernel what call it is in — and logs which
/// answer it got, because the background's own memory is not the test's to read.
const ASKING_THE_BACKGROUND: &str = r#"
    (module
      (import "enjoy" "video_info" (func $info (param i32 i32) (result i32)))
      (import "enjoy" "log" (func $log (param i32 i32 i32)))
      (memory (export "memory") 1)
      (data (i32.const 200) "V-EMPTY")
      (data (i32.const 300) "V-SET")
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "run")
        (if (i32.eqz (call $info (i32.const 4096) (i32.const 64)))
          (then (call $log (i32.const 2) (i32.const 200) (i32.const 7)))
          (else (call $log (i32.const 2) (i32.const 300) (i32.const 5)))))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` makes twenty-four half-second host calls — twelve
/// seconds in all, well past one call's budget — and only then says it is still
/// alive.
///
/// If the budget were armed once and shared across the whole background, the
/// epoch would stop it halfway; each host call re-arming is what lets a plugin's
/// loop take as long as its work takes. Twelve rather than six seconds because
/// the epoch ticker is a `sleep`, so the deadline lands a little after the
/// nominal five seconds, and a test that finishes inside that slack would pass
/// whether or not anything re-armed.
const LIVING_ON_BORROWED_TIME: &str = r#"
    (module
      (import "enjoy" "task_wait" (func $wait (param i64 i32 i32) (result i32)))
      (import "enjoy" "log" (func $log (param i32 i32 i32)))
      (memory (export "memory") 1)
      (data (i32.const 200) "BG-ALIVE")
      (data (i32.const 400) "front")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func $touch (param $n i32) (result i32)
        (local $i i32)
        (block $done
          (loop $again
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
            (br $again)))
        (local.get $i))
      (func (export "run")
        (local $i i32)
        (block $done
          (loop $again
            (drop (call $wait (i64.const 500) (i32.const 4096) (i32.const 64)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br_if $done (i32.ge_s (local.get $i) (i32.const 24)))
            (br $again)))
        (drop (call $touch (i32.const 2)))
        (call $log (i32.const 2) (i32.const 200) (i32.const 8)))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// A module whose `run` fetches once and then says whether the body arrived.
///
/// The URL and its length are filled in per test: the background is in no call,
/// so it has no payload to read a URL out of. `$touch` is a few turns of wasm
/// between the fetch and the log — the stretch where a stale deadline would be
/// noticed, and where a plugin's parsing code lives.
const SLOW_FETCHING: &str = r#"
    (module
      (import "enjoy" "fetch" (func $fetch (param i32 i32 i32 i32 i32 i32) (result i64)))
      (import "enjoy" "log" (func $log (param i32 i32 i32)))
      (memory (export "memory") 1)
      (data (i32.const 200) "BG-FETCH-GOT")
      (data (i32.const 300) "BG-FETCH-MISS")
      (data (i32.const 400) "front")
      (data (i32.const 1024) "__URL__")
      (func (export "alloc") (param i32) (result i32) (i32.const 2048))
      (func $touch (param $n i32) (result i32)
        (local $i i32)
        (block $done
          (loop $again
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
            (br $again)))
        (local.get $i))
      (func (export "run")
        (local $packed i64)
        (local.set $packed (call $fetch (i32.const 1024) (i32.const __LEN__) (i32.const 0) (i32.const 0) (i32.const 4096) (i32.const 64)))
        (drop (call $touch (i32.const 2)))
        (if (i64.eq (i64.and (local.get $packed) (i64.const 0xffffffff)) (i64.const 5))
          (then (call $log (i32.const 2) (i32.const 200) (i32.const 12)))
          (else (call $log (i32.const 2) (i32.const 300) (i32.const 13)))))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or (i64.shl (i64.const 400) (i64.const 32)) (i64.const 5))))
"#;

/// Pushes one runnable task for the body's plugin and returns its id.
fn push_one(library: &Arc<Mutex<Repository>>) -> i64 {
    library
        .lock()
        .unwrap()
        .push_task(Some(PLUGIN), 1, None, "scrape", "{}")
        .unwrap()
}

/// Waits until the task reaches `state`, or fails after a short grace.
fn await_state(library: &Arc<Mutex<Repository>>, id: i64, state: TaskState) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let task = library.lock().unwrap().task(id).unwrap();
        if task.state == state {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "the task never reached {state:?}: it is {:?} with attempts {} and {:?}",
            task.state,
            task.attempts,
            task.last_error.as_deref().unwrap_or("no error"),
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Waits until the log has a line containing `needle`, or fails after `within`.
fn await_log(log: &Arc<Mutex<String>>, needle: &str, within: Duration) {
    let deadline = Instant::now() + within;
    loop {
        if log.lock().unwrap().contains(needle) {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "the log never said {needle}: {}",
            log.lock().unwrap()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn a_plugin_without_run_never_works_the_queue() {
    let library = library();
    let id = push_one(&library);
    let body = body_on(WITHOUT_RUN, &library).unwrap();
    // Nothing but the test is running, and the test does not claim: the task
    // stays exactly where it was pushed, which is what "no second thread"
    // looks like from the outside.
    std::thread::sleep(Duration::from_millis(300));
    let task = library.lock().unwrap().task(id).unwrap();
    assert_eq!(task.state, TaskState::Pending, "a second instance ran");
    assert_eq!(task.attempts, 0);
    // And the front half is a body like any other.
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
}

#[test]
fn a_plugin_with_run_works_the_queue_in_its_own_thread() {
    let library = library();
    let body = body_on(RUNNING_THE_QUEUE, &library).unwrap();
    // The front half queues the work and answers at once: pushing is the whole
    // of what a menu item does, and the push is also what wakes a background
    // that is already parked in `task_wait`.
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
    // The task is finished by the background loop, not by the call above. Its id
    // is the first in a fresh library, which is the one the WAT finishes.
    let id = 1;
    await_state(&library, id, TaskState::Done);
    let task = library.lock().unwrap().task(id).unwrap();
    assert_eq!(task.plugin.as_deref(), Some(PLUGIN));
    assert_eq!(task.attempts, 1);
}

#[test]
fn a_background_that_returns_leaves_the_front_answering() {
    let body = body_on(RETURNING, &library()).unwrap();
    // The background is over the moment `run` returns; the front half is not
    // affected by that, which is the whole of the promise.
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
}

#[test]
fn a_background_that_traps_is_logged_and_the_front_keeps_working() {
    let logged = logged();
    let body = body_on(TRAPPING, &library()).unwrap();
    // The front mount point answers after the background is dead: a broken
    // background half must not take the plugin's answers down with it.
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
    await_log(logged, "background run failed", Duration::from_secs(2));
    let lines = logged.lock().unwrap().clone();
    assert!(lines.contains(PLUGIN), "{lines}");
}

#[test]
fn a_background_is_in_no_call_and_reads_an_empty_context() {
    let logged = logged();
    let body = body_on(ASKING_THE_BACKGROUND, &library()).unwrap();
    // `video_info` answers the params of the call in flight (spec #82); the
    // background instance is not in one, so what it reads is an empty object
    // rather than some earlier call's leftovers (spec #96 §4).
    await_log(logged, "V-EMPTY", Duration::from_secs(2));
    assert!(!logged.lock().unwrap().contains("V-SET"));
    // And the front instance still answers its own context, untouched.
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
}

#[test]
fn stopping_wakes_the_background_and_stops_both_threads() {
    let body = body_on(SLEEPING, &library()).unwrap();
    // Let the background reach its `task_wait`.
    std::thread::sleep(Duration::from_millis(100));
    let started = Instant::now();
    body.stop();
    let took = started.elapsed();
    // The wait asked for thirty seconds; the stop brought it back at once. The
    // join inside `stop` is why this returns only once the threads are gone.
    assert!(took < Duration::from_secs(2), "{took:?}");
    // And the front thread is gone too: a call after the stop is refused rather
    // than left waiting for a thread that is not there.
    let answer = body.handle("video.fields", "{}");
    assert!(matches!(answer, Err(RunnerError::Failed(_))), "{answer:?}");
}

#[test]
fn each_host_call_arms_its_own_five_seconds() {
    let logged = logged();
    let started = Instant::now();
    let body = body_on(LIVING_ON_BORROWED_TIME, &library()).unwrap();
    // Twenty-four half-second waits are twelve seconds of background life, and
    // the budget is five. Only re-arming on every host call lets the loop reach
    // its last line; without it the epoch stops the loop mid-wait.
    await_log(logged, "BG-ALIVE", Duration::from_secs(20));
    assert!(
        started.elapsed() >= Duration::from_secs(10),
        "{:?}",
        started.elapsed()
    );
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
}

#[test]
fn a_background_fetch_may_outlast_one_call_deadline() {
    let _ports = crate::ports::the_machine_ports();
    let logged = logged();
    let url = slow(
        10_000,
        "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
    );
    let source = SLOW_FETCHING
        .replace("__URL__", &url)
        .replace("__LEN__", &url.len().to_string());
    let started = Instant::now();
    let body = body_on(&source, &library()).unwrap();
    // The background's fetch carries its own twenty-second timeout rather than
    // the call's five, because a site request often takes longer than a call
    // may (spec #96 §4). What must not happen is the epoch stopping the loop
    // the moment the fetch comes back: the budget is for the wasm that follows
    // the call, so it is armed on the way out, not only on the way in.
    await_log(logged, "BG-FETCH-GOT", Duration::from_secs(16));
    assert!(
        started.elapsed() >= Duration::from_secs(10),
        "{:?}",
        started.elapsed()
    );
    assert!(!logged.lock().unwrap().contains("BG-FETCH-MISS"));
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "front");
}

#[test]
#[ignore = "waits out the background fetch's twenty-second timeout"]
fn a_background_fetch_gives_up_after_twenty_seconds() {
    let _ports = crate::ports::the_machine_ports();
    let logged = logged();
    let url = silent();
    let source = SLOW_FETCHING
        .replace("__URL__", &url)
        .replace("__LEN__", &url.len().to_string());
    let started = Instant::now();
    let _body = body_on(&source, &library()).unwrap();
    // The server never answers, and only the background's own timeout can end
    // the wait. It ends with nothing, and the loop goes on afterwards.
    await_log(logged, "BG-FETCH-MISS", Duration::from_secs(25));
    assert!(
        started.elapsed() >= Duration::from_secs(20),
        "the fetch gave up after {:?}",
        started.elapsed()
    );
}
