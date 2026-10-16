use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use wasmtime::Store;

use crate::plugins::runner::{Runner, RunnerError};
use crate::ports::the_machine_ports;
use crate::repository::fixture::Fixture;

use super::{WasmBody, CALL_DEADLINE};

/// The name every body in these tests is loaded under.
const PLUGIN: &str = "com.example.one";

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
/// and answers with the body.
///
/// The status is dropped rather than answered with: what the host reads back is
/// a pointer and a length, so a module that answered with the packed status
/// would be telling the host to read its answer from address 200.
const FETCHING: &str = r#"
    (module
      (import "enjoy" "fetch" (func $fetch (param i32 i32 i32 i32) (result i64)))
      (memory (export "memory") 1)
      (func (export "alloc") (param i32) (result i32) (i32.const 1024))
      (func (export "handle") (param i32 i32 i32 i32) (result i64)
        (local $packed i64)
        (local.set $packed (call $fetch (local.get 2) (local.get 3) (i32.const 8192) (i32.const 4096)))
        (i64.or
          (i64.shl (i64.const 8192) (i64.const 32))
          (i64.and (local.get $packed) (i64.const 0xffffffff)))))
"#;

/// A body made out of WAT text, on a data directory the caller keeps.
///
/// The text is assembled here rather than committed as a `.wasm`: `wasm32` is
/// not a target this repository builds for, and a fixture that needs another
/// toolchain to have run first is a fixture that stops being run.
fn load(directory: &Fixture, source: &str) -> Result<Arc<dyn Runner>, RunnerError> {
    let module = wat::parse_str(source).unwrap();
    Ok(WasmBody::load(PLUGIN, &module, directory.0.clone())?)
}

/// The same, on a directory of its own that outlives this call.
///
/// Kept rather than dropped: a fixture removes what it made when it goes, and
/// the plugin's thread is still using that directory long after this returns.
fn try_body(source: &str) -> Result<Arc<dyn Runner>, RunnerError> {
    static KEPT: OnceLock<Mutex<Vec<Fixture>>> = OnceLock::new();
    let directory = Fixture::new();
    let body = load(&directory, source);
    KEPT.get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap()
        .push(directory);
    body
}

/// The same, for the modules that are expected to load.
fn body(source: &str) -> Arc<dyn Runner> {
    try_body(source).unwrap()
}

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
fn the_kernel_grants_the_four_capabilities_and_nothing_else() {
    let engine = super::engine().unwrap();
    let linker = super::imports::linker(engine).unwrap();
    let directory = Fixture::new();
    let mut store = Store::new(
        engine,
        super::imports::Guest::new(PLUGIN, directory.0.clone()),
    );
    let mut granted: Vec<String> = linker
        .iter(&mut store)
        .map(|(module, name, _)| format!("{module}.{name}"))
        .collect();
    granted.sort();
    // The whole list, spelled out. A fifth capability is a change to this test
    // as well as to `imports` — which is the point: what a body can do is a
    // decision someone makes here, not something a plugin finds (ADR 0044 §1).
    // Storage is two of the five because reading and writing are separately
    // grantable things, and the four capability names are those two plus three.
    assert_eq!(
        granted,
        [
            "enjoy.fetch",
            "enjoy.log",
            "enjoy.storage_read",
            "enjoy.storage_write",
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

#[test]
fn a_body_is_told_what_the_call_is_about() {
    let body = body(ASKING);
    let params = r#"{"space":{"id":1},"video":{"id":7}}"#;
    assert_eq!(body.handle("video.fields", params).unwrap(), params);
}

#[test]
fn a_body_keeps_its_files_in_its_own_directory_and_nowhere_else() {
    let directory = Fixture::new();
    let body = load(&directory, KEEPING).unwrap();
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

/// A server on the loopback that answers every request with these bytes.
fn serving(response: &'static str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut request = [0u8; 1024];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(response.as_bytes());
        }
    });
    address
}

/// A server on the loopback that accepts and then says nothing at all.
///
/// The connections are held rather than dropped: closing one would answer the
/// request with an end of stream, which is an answer, and what this is for is
/// the request that never gets one.
fn silent() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    thread::spawn(move || {
        let mut held = Vec::new();
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => held.push(stream),
                Err(_) => break,
            }
        }
    });
    address
}

/// The lines the log has been given, for the one test that reads them.
///
/// The kernel's log is `tracing` (`crate::logging`), which has no port and no
/// double: what a plugin's line has to reach is the subscriber the application
/// installs, so the way to see one is to install a subscriber. It is installed
/// once for the whole binary — a global default can only be set once — and
/// everything else that logs during the run lands in the same buffer, which is
/// harmless because only this test reads it.
fn logged() -> &'static Arc<Mutex<String>> {
    #[derive(Clone)]
    struct Captured(Arc<Mutex<String>>);

    impl Write for Captured {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0
                .lock()
                .unwrap()
                .push_str(&String::from_utf8_lossy(bytes));
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Captured {
        type Writer = Self;

        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    static LOGGED: OnceLock<Arc<Mutex<String>>> = OnceLock::new();
    LOGGED.get_or_init(|| {
        let logged = Arc::new(Mutex::new(String::new()));
        let subscriber = tracing_subscriber::fmt()
            .with_writer(Captured(logged.clone()))
            .with_ansi(false)
            .finish();
        let _ = tracing::subscriber::set_global_default(subscriber);
        logged
    })
}
