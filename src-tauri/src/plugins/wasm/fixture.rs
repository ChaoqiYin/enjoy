//! The harness the runtime's tests are written on.
//!
//! Shared by the two test modules beside this one rather than kept in
//! whichever of them is larger: both need a body made out of WAT text, and
//! the ones about the four capabilities need a server to fetch from.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use crate::plugins::runner::{Runner, RunnerError};
use crate::repository::fixture::Fixture;
use crate::repository::Repository;

use super::WasmBody;

/// The name every body in these tests is loaded under.
pub(super) const PLUGIN: &str = "com.example.one";

/// The temporary directories built for the run, kept so a body that outlives
/// the test that made it still has somewhere to read and write.
static KEPT: OnceLock<Mutex<Vec<Fixture>>> = OnceLock::new();

fn keep(home: Fixture) {
    KEPT.get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .push(home);
}

/// A body made out of WAT text, on a data directory the caller keeps.
///
/// The text is assembled here rather than committed as a `.wasm`: `wasm32` is
/// not a target this repository builds for, and a fixture that needs another
/// toolchain to have run first is a fixture that stops being run.
pub(super) fn load(
    directory: &Fixture,
    source: &str,
    repository: &Arc<Mutex<Repository>>,
) -> Result<Arc<dyn Runner>, RunnerError> {
    let module = wat::parse_str(source).unwrap();
    Ok(WasmBody::load(
        PLUGIN,
        &module,
        directory.0.clone(),
        Arc::clone(repository),
    )?)
}

/// A library for a body to run against, and one that outlives it.
///
/// Kept rather than dropped, for the reason the directories below are: the
/// plugin's thread reads rows through this handle long after the test that made
/// it returns. A fresh one per call, so a test that seeds or inspects a task is
/// looking at its own library and no other test's.
pub(super) fn library() -> Arc<Mutex<Repository>> {
    let home = Fixture::new();
    let library = home.library();
    keep(home);
    Arc::new(Mutex::new(library.repository))
}

/// The same, on a directory of its own that outlives this call.
///
/// Kept rather than dropped: a fixture removes what it made when it goes, and
/// the plugin's thread is still using that directory long after this returns.
pub(super) fn try_body(source: &str) -> Result<Arc<dyn Runner>, RunnerError> {
    let directory = Fixture::new();
    let body = load(&directory, source, &library());
    keep(directory);
    body
}

/// A body on the given library, outliving this call, for the tests that ask
/// what a plugin's `task_*` calls left in it.
pub(super) fn body_on(
    source: &str,
    repository: &Arc<Mutex<Repository>>,
) -> Result<Arc<dyn Runner>, RunnerError> {
    let directory = Fixture::new();
    let body = load(&directory, source, repository);
    keep(directory);
    body
}

/// The same, for the modules that are expected to load.
pub(super) fn body(source: &str) -> Arc<dyn Runner> {
    try_body(source).unwrap()
}

/// A server on the loopback that answers every request with these bytes.
pub(super) fn serving(response: &'static str) -> String {
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

/// A server on the loopback that answers every request with the request head
/// it received, as the body of a well-formed response.
///
/// What a test needs to see is what went out on the wire — the headers, which
/// are the whole point of the caller-supplied ones — and the only place that
/// fact exists is the request the server read. The body is cut at the blank
/// line: the rest would be the request body, and `fetch` is a `GET`. The
/// answer is wrapped in a `Content-Length` so the client reads it and stops,
/// rather than waiting for a close that this server does not do.
pub(super) fn echoing() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let mut request = Vec::new();
            let mut chunk = [0u8; 1024];
            loop {
                let Ok(read) = stream.read(&mut chunk) else {
                    break;
                };
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") || request.len() > 8192 {
                    break;
                }
            }
            let head = String::from_utf8_lossy(&request).into_owned();
            let head = head
                .split("\r\n\r\n")
                .next()
                .unwrap_or_default()
                .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                head.len(),
                head
            );
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
pub(super) fn silent() -> String {
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
pub(super) fn logged() -> &'static Arc<Mutex<String>> {
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
