//! What a body can do besides answering: the four granted capabilities.

use std::net::TcpListener;
use std::time::{Duration, Instant};

use wasmtime::Store;

use crate::plugins::runner::{Runner, RunnerError};
use crate::ports::the_machine_ports;
use crate::repository::fixture::Fixture;

use super::fixture::{body, echoing, library, load, logged, serving, silent, try_body, PLUGIN};
use super::CALL_DEADLINE;

/// A module that asks the kernel what the call is about, and answers with it.
const ASKING: &str = r#"
    (module
      (import "enjoy" "video_info" (func $info (param i32 i32) (result i32)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (local.set $len (call $info (i32.const 4096) (i32.const 4096)))
        (i64.or
          (i64.shl (i64.extend_i32_u (i32.const 4096)) (i64.const 32))
          (i64.extend_i32_u (local.get $len)))))
"#;

/// A module that keeps a note for itself, and tries to keep one outside.
///
/// The second write is the point: a plugin's directory is the only one it has,
/// and `../escape` is a name that has to be refused rather than resolved.
const KEEPING: &str = r#"
    (module
      (import "enjoy" "storage_write" (func $write (param i32 i32 i32 i32) (result i32)))
      (import "enjoy" "storage_read" (func $read (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "note")
      (data (i32.const 200) "hello")
      (data (i32.const 300) "../escape")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (drop (call $write (i32.const 100) (i32.const 4) (i32.const 200) (i32.const 5)))
        (drop (call $write (i32.const 300) (i32.const 9) (i32.const 200) (i32.const 5)))
        (local.set $len (call $read (i32.const 100) (i32.const 4) (i32.const 4096) (i32.const 64)))
        (i64.or
          (i64.shl (i64.extend_i32_u (i32.const 4096)) (i64.const 32))
          (i64.extend_i32_u (local.get $len)))))
"#;

/// A module that says one line, and then answers.
const SAYING: &str = r#"
    (module
      (import "enjoy" "log" (func $log (param i32 i32 i32)))
      (memory (export "memory") 1)
      (data (i32.const 200) "PLUGIN-MARK")
      (data (i32.const 4096) "done")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (call $log (i32.const 1) (i32.const 200) (i32.const 11))
        (i64.const 0x0000100000000004)))
"#;

/// A module that fetches the URL the kernel was given as this call's params,
/// with no headers of its own, and answers with the body.
///
/// The status is dropped rather than answered with: what the host reads back is
/// a pointer and a length, so a module that answered with the packed status
/// would be telling the host to read its answer from address 200.
const FETCHING: &str = r#"
    (module
      (import "enjoy" "fetch" (func $fetch (param i32 i32 i32 i32 i32 i32) (result i64)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $packed i64)
        (local.set $packed (call $fetch (local.get 2) (local.get 3) (i32.const 0) (i32.const 0) (i32.const 8192) (i32.const 4096)))
        (i64.or
          (i64.shl (i64.const 8192) (i64.const 32))
          (i64.and (local.get $packed) (i64.const 0xffffffff)))))
"#;

/// A module that fetches with a header list of its own, and answers with the
/// request head the server saw.
///
/// The header list is a JSON array of names and values, the same shape the
/// kernel takes from a plugin everywhere else. The answer is the body, which
/// for this test's server is the request itself — so what comes back carries
/// exactly the headers that went out.
const FETCHING_WITH_HEADERS: &str = r#"
    (module
      (import "enjoy" "fetch" (func $fetch (param i32 i32 i32 i32 i32 i32) (result i64)))
      (memory (export "memory") 1)
      (data (i32.const 200) "[{\"name\":\"User-Agent\",\"value\":\"PluginUA/1.0\"},{\"name\":\"Referer\",\"value\":\"https://example.test/\"}]")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $packed i64)
        (local.set $packed (call $fetch (local.get 2) (local.get 3) (i32.const 200) (i32.const 97) (i32.const 8192) (i32.const 4096)))
        (i64.or
          (i64.shl (i64.const 8192) (i64.const 32))
          (i64.and (local.get $packed) (i64.const 0xffffffff)))))
"#;

/// A module that fetches with a header list that is not one at all.
const FETCHING_WITH_BROKEN_HEADERS: &str = r#"
    (module
      (import "enjoy" "fetch" (func $fetch (param i32 i32 i32 i32 i32 i32) (result i64)))
      (memory (export "memory") 1)
      (data (i32.const 200) "not a list")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $packed i64)
        (local.set $packed (call $fetch (local.get 2) (local.get 3) (i32.const 200) (i32.const 10) (i32.const 8192) (i32.const 4096)))
        (i64.or
          (i64.shl (i64.const 8192) (i64.const 32))
          (i64.and (local.get $packed) (i64.const 0xffffffff)))))
"#;

/// A module that writes one note twice, and answers with the second.
///
/// The second write is what makes the atomicity visible: a killed first write
/// would leave the file half of "hello, world", but even a surviving one has
/// to leave the file exactly as the last write says and nothing of the first.
const REWRITING: &str = r#"
    (module
      (import "enjoy" "storage_write" (func $write (param i32 i32 i32 i32) (result i32)))
      (import "enjoy" "storage_read" (func $read (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 100) "note")
      (data (i32.const 200) "hello, world")
      (data (i32.const 300) "bye")
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $len i32)
        (drop (call $write (i32.const 100) (i32.const 4) (i32.const 200) (i32.const 12)))
        (drop (call $write (i32.const 100) (i32.const 4) (i32.const 300) (i32.const 3)))
        (local.set $len (call $read (i32.const 100) (i32.const 4) (i32.const 4096) (i32.const 64)))
        (i64.or
          (i64.shl (i64.const 4096) (i64.const 32))
          (i64.extend_i32_u (local.get $len)))))
"#;

/// A module that asks for something the kernel does not grant.
const ASKING_FOR_A_FIFTH: &str = r#"
    (module
      (import "enjoy" "read_file" (func $read (param i32 i32) (result i32)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (drop (call $read (i32.const 0) (i32.const 0)))
        (i64.const 0)))
"#;

/// A module that asks for the environment wasm modules usually find.
const ASKING_FOR_WASI: &str = r#"
    (module
      (import "wasi_snapshot_preview1" "fd_write"
        (func $fd_write (param i32 i32 i32 i32) (result i32)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (drop (call $fd_write (i32.const 0) (i32.const 0) (i32.const 0) (i32.const 0)))
        (i64.const 0)))
"#;

#[test]
fn the_kernel_grants_the_four_capabilities_and_nothing_else() {
    let engine = super::engine().unwrap();
    let linker = super::imports::linker(engine).unwrap();
    let directory = Fixture::new();
    let queue = super::tasks::Queue::new(PLUGIN, library());
    let mut store = Store::new(
        engine,
        super::imports::Guest::new(PLUGIN, directory.0.clone(), queue),
    );
    let mut granted: Vec<String> = linker
        .iter(&mut store)
        .map(|(module, name, _)| format!("{module}.{name}"))
        .collect();
    granted.sort();
    // The whole list, spelled out. A twelfth capability is a change to this test
    // as well as to `imports` — which is the point: what a body can do is a
    // decision someone makes here, not something a plugin finds (ADR 0044 §1).
    // Storage is two of the twelve because reading and writing are separately
    // grantable things, the queue is six because its verbs are, and the four
    // capability names are those two plus log, fetch and video_info.
    assert_eq!(
        granted,
        [
            "enjoy.fetch",
            "enjoy.log",
            "enjoy.storage_read",
            "enjoy.storage_write",
            "enjoy.task_checkpoint",
            "enjoy.task_done",
            "enjoy.task_fail",
            "enjoy.task_progress",
            "enjoy.task_push",
            "enjoy.task_wait",
            "enjoy.video_info",
        ]
    );
}

#[test]
fn a_body_that_asks_for_more_than_that_does_not_load() {
    // A name the kernel never defines, and the environment a wasm module might
    // hope for. Neither is there, and a module that asks for one is a module
    // that does not run rather than one that runs without it.
    for source in [ASKING_FOR_A_FIFTH, ASKING_FOR_WASI] {
        let refused = try_body(source).err();
        assert!(
            matches!(refused, Some(RunnerError::Failed(_))),
            "{refused:?}"
        );
    }
}

#[test]
fn a_body_is_told_what_the_call_is_about() {
    let body = body(ASKING);
    let params = r#"{"space":{"id":1},"video":{"id":7}}"#;
    assert_eq!(body.handle("video.fields", params).unwrap(), params);
}

#[test]
fn a_body_keeps_its_files_in_its_own_directory_and_nowhere_else() {
    let directory = Fixture::new();
    let body = load(&directory, KEEPING, &library()).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "hello");
    assert_eq!(
        std::fs::read_to_string(directory.0.join("note")).unwrap(),
        "hello"
    );
    // `../escape` is not a name this capability accepts, so there is nothing to
    // find one level up — not an empty file, and not a file at all.
    let beside = directory.0.parent().unwrap().join("escape");
    assert!(!beside.exists(), "{} was written", beside.display());
}

#[test]
fn a_line_a_body_writes_reaches_the_log() {
    let logged = logged();
    let body = body(SAYING);
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "done");
    let logged = logged.lock().unwrap().clone();
    // Both facts the file has to carry: what the plugin said, and which plugin
    // said it — a user reading the log has no other way to tell.
    assert!(logged.contains("PLUGIN-MARK"), "{logged}");
    assert!(logged.contains(PLUGIN), "{logged}");
}

#[test]
fn a_body_fetches_a_url_through_the_kernel() {
    let _ports = the_machine_ports();
    let body = body(FETCHING);
    let url = serving("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
    assert_eq!(body.handle("fetch", &url).unwrap(), "hello");
}

#[test]
fn a_fetch_that_does_not_arrive_is_not_an_answer() {
    let _ports = the_machine_ports();
    let body = body(FETCHING);
    // A port the machine just handed out and nothing is listening on any more.
    let url = {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
        format!("http://{}", listener.local_addr().expect("a bound address"))
    };
    // Status 0 is not a status a server sent, and the body that comes with it
    // is empty: a plugin can tell "nothing arrived" from any answer there is.
    assert_eq!(body.handle("fetch", &url).unwrap(), "");
}

#[test]
fn a_body_that_was_given_up_on_is_still_asked() {
    let _ports = the_machine_ports();
    let body = body(FETCHING);
    let answer = body.handle("fetch", &silent());
    assert!(matches!(answer, Err(RunnerError::TimedOut)), "{answer:?}");
    // What a timeout ends is the call, not the plugin (`RunnerError::TimedOut`):
    // the instance is resident and the next call is answered like any other.
    // This is the one thing about a timeout that the code does not say — the
    // future `call_async` returned is dropped while wasm is inside a host
    // function — and it is worth pinning, because a store wasmtime left
    // unusable would mean a plugin that timed out once was finished, which is
    // not what the host's five failures are counting.
    let url = serving("HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
    assert_eq!(body.handle("fetch", &url).unwrap(), "hello");
}

#[test]
fn a_fetch_sends_the_headers_the_plugin_asked_for() {
    let _ports = the_machine_ports();
    let body = body(FETCHING_WITH_HEADERS);
    // The server answers with the request it read, so what comes back is what
    // went out: the caller's own headers, by name and value.
    let head = body.handle("fetch", &echoing()).unwrap();
    assert!(head.contains("User-Agent: PluginUA/1.0"), "{head}");
    assert!(head.contains("Referer: https://example.test/"), "{head}");
}

#[test]
fn a_fetch_with_no_headers_of_its_own_still_carries_the_clients_user_agent() {
    let _ports = the_machine_ports();
    let body = body(FETCHING);
    // `headers_len == 0` means "nothing of mine": the request still says whose
    // client it is, and a user reading a site's logs can see it was Enjoy.
    let head = body.handle("fetch", &echoing()).unwrap();
    assert!(head.contains("User-Agent: Enjoy/"), "{head}");
}

#[test]
fn a_fetch_whose_headers_are_not_a_list_is_not_made() {
    let _ports = the_machine_ports();
    let body = body(FETCHING_WITH_BROKEN_HEADERS);
    // No request goes out at all: an unparseable header list is a plugin
    // mistake, and the honest answer to a mistake is "nothing" (status 0),
    // not a request with half of what was asked for.
    assert_eq!(body.handle("fetch", &echoing()).unwrap(), "");
}

#[test]
fn a_written_note_is_the_last_one_written_and_nothing_else() {
    let directory = Fixture::new();
    let body = load(&directory, REWRITING, &library()).unwrap();
    assert_eq!(body.handle("video.fields", "{}").unwrap(), "bye");
    let note = directory.0.join("note");
    assert_eq!(std::fs::read_to_string(&note).unwrap(), "bye");
    // The whole file is the last write and nothing more: no tail of the longer
    // first write, and no half-written temporary beside it. A killed first
    // write would leave either a truncated `note` or a leftover temp — both
    // are the bug this write is built to not have.
    let beside: Vec<String> = std::fs::read_dir(directory.0.as_path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|name| name != "note")
        .collect();
    assert!(beside.is_empty(), "left behind: {beside:?}");
}

#[test]
fn a_body_waiting_on_a_host_function_is_cut_off_inside_the_deadline() {
    let _ports = the_machine_ports();
    let body = body(FETCHING);
    let started = Instant::now();
    let answer = body.handle("fetch", &silent());
    let took = started.elapsed();
    // The stretch neither epoch nor fuel can reach (ADR 0044 §6): the plugin is
    // not running its own instructions, it is waiting for the kernel. What has
    // to come back is the call, inside the deadline, rather than a caller that
    // waits as long as the server feels like taking.
    assert!(matches!(answer, Err(RunnerError::TimedOut)), "{answer:?}");
    assert!(took < CALL_DEADLINE + Duration::from_secs(1), "{took:?}");
}
