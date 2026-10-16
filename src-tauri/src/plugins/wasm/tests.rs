//! What the runtime does with a body: answers it, keeps it, and stops it.

use std::time::{Duration, Instant};

use wasmtime::Store;

use crate::plugins::runner::{Runner, RunnerError};
use crate::repository::fixture::Fixture;

use super::fixture::{body, try_body, PLUGIN};
use super::CALL_DEADLINE;

/// A module that answers every call with the same JSON, out of a data segment.
const ANSWERING: &str = r#"
    (module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (data (i32.const 2048) "{\"fields\":[]}")
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.const 2048)
        (i64.const 32)
        (i64.shl)
        (i64.const 13)
        (i64.or)))
"#;

/// A module that counts the calls it has been given, in its own memory.
const COUNTING: &str = r#"
    (module
      (memory (export "memory") 1)
      (global $calls (mut i32) (i32.const 0))
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (data (i32.const 2048) "first")
      (data (i32.const 2100) "again")
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $first i32)
        (local.set $first (i32.eqz (global.get $calls)))
        (global.set $calls (i32.add (global.get $calls) (i32.const 1)))
        (if (result i64) (local.get $first)
          (then (i64.const 0x0000080000000005))
          (else (i64.const 0x0000083400000005)))))
"#;

/// A module that never answers, and never gives the host a chance to ask again.
const ENDLESS: &str = r#"
    (module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (loop $forever (br $forever))
        (i64.const 0)))
"#;

/// A module that throws where an answer should be.
const THROWING: &str = r#"
    (module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (unreachable)))
"#;

/// A module that asks for more memory than a plugin is allowed to hold.
///
/// Three hundred pages is 19 MiB against a limit of 16 (see `MEMORY_LIMIT`), so
/// this one is refused before it can run a line of its own code.
const OVER_QUOTA: &str = r#"
    (module
      (memory (export "memory") 300)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.const 0)))
"#;

/// A module that answers with a length far past the end of its own memory.
///
/// Sixty-four mebibytes against a one-page instance: the host would have to
/// allocate that much before the read could refuse it, and a guest does not get
/// to say how much of the kernel's memory a call costs.
const ANSWERING_TOO_LONG: &str = r#"
    (module
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (i64.or
          (i64.shl (i64.const 4096) (i64.const 32))
          (i64.const 67108864))))
"#;

/// A module that hands a host function a length far past its own memory.
const WRITING_TOO_LONG: &str = r#"
    (module
      (import "enjoy" "storage_write" (func $write (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "note")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (drop (call $write (i32.const 100) (i32.const 4) (i32.const 4096) (i32.const 67108864)))
        (i64.const 0)))
"#;

#[test]
fn a_body_answers_what_its_module_says() {
    let body = body(ANSWERING);
    assert_eq!(
        body.handle("video.fields", "{}").unwrap(),
        r#"{"fields":[]}"#
    );
}

#[test]
fn a_body_keeps_its_state_between_calls() {
    let body = body(COUNTING);
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "first");
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "again");
}

#[test]
fn a_body_that_never_returns_is_cut_off_inside_the_deadline() {
    let body = body(ENDLESS);
    let started = Instant::now();
    let answer = body.handle("video.fields", "{}");
    let took = started.elapsed();
    assert!(matches!(answer, Err(RunnerError::TimedOut)), "{answer:?}");
    // The point of the limits is not that the call ends badly but that it ends:
    // a plugin that loops forever must not hold the kernel's thread forever.
    assert!(took < CALL_DEADLINE + Duration::from_secs(1), "{took:?}");
}

#[test]
fn a_body_that_throws_fails_rather_than_times_out() {
    let body = body(THROWING);
    let answer = body.handle("video.fields", "{}");
    assert!(matches!(answer, Err(RunnerError::Failed(_))), "{answer:?}");
}

#[test]
fn a_body_over_the_memory_limit_is_refused() {
    let refused = try_body(OVER_QUOTA).err();
    assert!(
        matches!(refused, Some(RunnerError::Failed(_))),
        "{refused:?}"
    );
}

#[test]
fn a_body_that_claims_more_than_it_has_is_refused_rather_than_believed() {
    // Two lengths, both the guest's own number and both far past the one page
    // the instance holds: the one it answers with, and the one it hands to a
    // host function. `MEMORY_LIMIT` holds the *instance* to sixteen mebibytes
    // and does not stand in the way of either — what would be allocated for
    // them is the kernel's own, made before any read could refuse it.
    //
    // That no four-gibibyte allocation actually happens is not something a
    // test can see; what it can see is that the call is refused, and refused
    // now rather than at the deadline.
    for source in [ANSWERING_TOO_LONG, WRITING_TOO_LONG] {
        let body = body(source);
        let started = Instant::now();
        let answer = body.handle("video.fields", "{}");
        let took = started.elapsed();
        assert!(matches!(answer, Err(RunnerError::Failed(_))), "{answer:?}");
        assert!(took < Duration::from_secs(1), "{took:?}");
    }
}
