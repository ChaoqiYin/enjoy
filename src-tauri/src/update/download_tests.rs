use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use super::control::{Stop, StopFlag};
use super::download::{fetch, next_attempt, Asked, Transfer, FIRST_BACKOFF, MAX_BACKOFF};
use super::verify::verify;

/// A server that serves `body` once, cutting the answer short after `cut`
/// bytes, and answers with ranges afterwards.
///
/// This is the connection this whole module exists for: one that dies partway
/// through with the length already announced. It hands back the address to
/// fetch from and the list of offsets it was asked for, so a test can say not
/// only that the bytes arrived but that they arrived by resuming.
fn spawn_cutting_server(body: Vec<u8>, cut: usize) -> (String, Arc<Mutex<Vec<u64>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    let served = Arc::new(AtomicUsize::new(0));
    let asked = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&asked);
    thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(mut connection) = connection else {
                break;
            };
            let start = range_start(&read_head(&mut connection));
            seen.lock().expect("the offsets are shared").push(start);
            if start as usize > body.len() {
                let _ = connection
                    .write_all(b"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Length: 0\r\n\r\n");
                continue;
            }
            let rest = &body[start as usize..];
            let head = match start {
                0 => format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n\r\n",
                    rest.len()
                ),
                _ => format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\n\r\n",
                    rest.len(),
                    start,
                    body.len() - 1,
                    body.len()
                ),
            };
            let _ = connection.write_all(head.as_bytes());
            let first = served.fetch_add(1, Ordering::SeqCst) == 0;
            let send = if first {
                &rest[..cut.min(rest.len())]
            } else {
                rest
            };
            let _ = connection.write_all(send);
            // Dropping the connection is the failure being reproduced: the
            // announced length is never reached.
            let _ = connection.flush();
        }
    });
    (address, asked)
}

fn read_head(connection: &mut TcpStream) -> String {
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while connection.read_exact(&mut byte).is_ok() {
        head.push(byte[0]);
        if head.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8_lossy(&head).into_owned()
}

/// The offset a request asks for. A request carrying no range header is asking
/// for all of it, which is what the first connection of a download does.
fn range_start(head: &str) -> u64 {
    head.lines()
        .find(|line| line.to_ascii_lowercase().starts_with("range:"))
        .and_then(|line| line.split_once("bytes="))
        .and_then(|(_, value)| value.split_once('-'))
        .and_then(|(start, _)| start.parse().ok())
        .unwrap_or(0)
}

fn body(length: usize) -> Vec<u8> {
    (0..length).map(|index| (index % 251) as u8).collect()
}

fn fetch_from(address: &str) -> Result<Vec<u8>, super::download::FetchError> {
    match fetch_whole(address, Vec::new(), &StopFlag::default()) {
        Transfer::Complete(bytes) => Ok(bytes),
        Transfer::Failed { error, .. } => Err(error),
        Transfer::Stopped { .. } => panic!("nothing asked this transfer to stop"),
    }
}

/// A transfer nobody interrupts, from whatever bytes are handed to it.
fn fetch_whole(address: &str, from: Vec<u8>, stop: &StopFlag) -> Transfer {
    tauri::async_runtime::block_on(async {
        let client = super::download::client("Enjoy test").expect("a client can be built");
        let url = address.parse().expect("the test server address is a URL");
        let mut told = 0u64;
        let transfer = fetch(&client, &url, from, stop, |downloaded, _| told = downloaded).await;
        // The progress a caller sees is the bytes it is holding, never more.
        if let Transfer::Complete(bytes) | Transfer::Stopped { bytes, .. } = &transfer {
            assert_eq!(told, bytes.len() as u64);
        }
        transfer
    })
}

/// A transfer the user stops from inside the progress callback, which is where
/// the press lands: the bytes are arriving, and the ask comes between two of
/// them.
fn stop_after(address: &str, wanted: u64, ask: Stop) -> Transfer {
    tauri::async_runtime::block_on(async {
        let client = super::download::client("Enjoy test").expect("a client can be built");
        let url = address.parse().expect("the test server address is a URL");
        let stop = StopFlag::default();
        let flag = &stop;
        fetch(&client, &url, Vec::new(), flag, |downloaded, _| {
            if downloaded >= wanted {
                flag.request(ask);
            }
        })
        .await
    })
}

#[test]
fn a_cut_connection_is_resumed_rather_than_restarted() {
    let expected = body(200_000);
    let (address, asked) = spawn_cutting_server(expected.clone(), 60_000);
    let bytes = fetch_from(&address).expect("the payload arrives across two connections");

    assert_eq!(bytes, expected);
    let asked = asked.lock().expect("the offsets are shared").clone();
    assert!(asked.len() >= 2, "a second connection is opened at all");
    assert_eq!(asked[0], 0, "the first connection asks for everything");
    assert_eq!(
        asked[1], 60_000,
        "the second asks for what is missing, not for the file again"
    );
}

#[test]
fn a_server_that_never_continues_what_is_held_gives_up() {
    // Every answer claims to start at the beginning, whatever was asked for, so
    // nothing that arrives can be kept. That is a loss rather than a lack of
    // progress — worse, in fact — and it has to end the loop rather than have
    // the download asked for again a thousand times.
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    let whole = body(200_000);
    thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(mut connection) = connection else {
                break;
            };
            let _ = read_head(&mut connection);
            let cut = &whole[..40_000];
            let head = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes 0-{}/{}\r\n\r\n",
                cut.len(),
                whole.len() - 1,
                whole.len()
            );
            let _ = connection.write_all(head.as_bytes());
            let _ = connection.write_all(cut);
            let _ = connection.flush();
        }
    });
    let started = std::time::Instant::now();
    assert!(
        fetch_from(&address).is_err(),
        "a range that never continues what is held cannot be assembled"
    );
    assert!(
        started.elapsed() < Duration::from_secs(30),
        "and it is given up on, which took {:?}",
        started.elapsed()
    );
}

#[test]
fn a_server_that_answers_nothing_at_all_gives_up() {
    // A listener that accepts and closes without a byte: the connections run
    // out rather than the loop running forever.
    let listener = TcpListener::bind("127.0.0.1:0").expect("a port on the loopback");
    let address = format!("http://{}", listener.local_addr().expect("a bound address"));
    thread::spawn(move || {
        for connection in listener.incoming() {
            drop(connection);
        }
    });
    let started = std::time::Instant::now();
    let outcome = fetch_from(&address);
    assert!(outcome.is_err(), "there is nothing to fetch");
    assert!(
        started.elapsed() < Duration::from_secs(30),
        "giving up is bounded, and it took {:?}",
        started.elapsed()
    );
}

#[test]
fn another_connection_is_offered_while_the_last_one_brought_bytes() {
    // Progress is what buys attempts. A link that drops every few seconds still
    // converges as long as each connection brings something, so the run of
    // empty connections has to be what ends it — not the count of connections.
    assert_eq!(next_attempt(1, 0), Some(FIRST_BACKOFF));
    assert_eq!(next_attempt(50, 0), Some(FIRST_BACKOFF));
}

#[test]
fn a_run_of_empty_connections_is_what_ends_it() {
    // One drop is this network's normal state; a run of them is a server that
    // has stopped answering. The wait grows with the run and stops growing at
    // the ceiling, and the run ends the download rather than the loop
    // reconnecting forever.
    let first = next_attempt(1, 1).expect("one empty connection is not the end");
    let later = next_attempt(2, 2).expect("two are not either");
    assert!(later > first, "the wait grows with the run");
    assert_eq!(
        next_attempt(4, 3),
        Some(MAX_BACKOFF),
        "the ceiling is reached before the run ends, not after it"
    );
    assert_eq!(next_attempt(4, 4), Some(MAX_BACKOFF));
    assert_eq!(next_attempt(20, 5), None, "the run of empty ones ends it");
}

#[test]
fn too_many_connections_end_it_even_with_progress() {
    // The other end: a server handing over a byte per connection converges in
    // theory and never in practice, so the count stops it too.
    assert!(next_attempt(999, 0).is_some());
    assert_eq!(next_attempt(1000, 0), None);
}

#[test]
fn a_ceiling_end_is_reported_as_its_own_thing() {
    let error = super::download::FetchError::Exhausted(500);
    assert_eq!(error.to_string(), "gave up after 500 connections");
}

#[test]
fn a_pause_ends_the_transfer_where_it_stands() {
    let expected = body(200_000);
    let (address, _) = spawn_cutting_server(expected.clone(), 60_000);
    match stop_after(&address, 1, Stop::Pause) {
        Transfer::Stopped {
            asked,
            bytes,
            total,
        } => {
            assert_eq!(asked, Asked::Pause);
            assert!(!bytes.is_empty(), "what had arrived is handed back");
            assert!(
                expected.starts_with(&bytes),
                "and what is handed back is the payload itself, not a mixture of it"
            );
            assert_eq!(
                total,
                Some(expected.len() as u64),
                "the announced length comes with it, so a paused bar can still say how far"
            );
        }
        _ => panic!("a pause was asked for and not obeyed"),
    }
}

#[test]
fn a_cancel_ends_the_transfer_the_same_way_and_says_so() {
    // The transfer reports which ask stopped it; keeping or dropping the bytes
    // is the caller's decision, and this is the value it decides on.
    let (address, _) = spawn_cutting_server(body(200_000), 60_000);
    assert!(
        matches!(
            stop_after(&address, 1, Stop::Cancel),
            Transfer::Stopped {
                asked: Asked::Cancel,
                ..
            }
        ),
        "a cancel is told apart from a pause rather than both reading as a stop"
    );
}

#[test]
fn a_paused_transfer_continues_from_what_it_kept() {
    let expected = body(200_000);
    let (address, asked) = spawn_cutting_server(expected.clone(), 60_000);
    let kept = match stop_after(&address, 1, Stop::Pause) {
        Transfer::Stopped { bytes, .. } => bytes,
        _ => panic!("a pause was asked for and not obeyed"),
    };

    let resumed = match fetch_whole(&address, kept.clone(), &StopFlag::default()) {
        Transfer::Complete(bytes) => bytes,
        _ => panic!("nothing stopped the second transfer"),
    };
    assert_eq!(resumed, expected, "the two halves are one payload");
    let asked = asked.lock().expect("the offsets are shared").clone();
    assert_eq!(
        asked[1],
        kept.len() as u64,
        "and the second transfer asks for exactly what the first was missing"
    );
}

#[test]
fn a_stop_asked_for_before_the_first_connection_opens_none() {
    // The moment between pressing download and pressing pause is short; a
    // transfer that has been told to stop before it starts must not spend a
    // connection finding that out.
    let (address, asked) = spawn_cutting_server(body(200_000), 60_000);
    let stop = StopFlag::default();
    stop.request(Stop::Pause);
    match fetch_whole(&address, Vec::new(), &stop) {
        Transfer::Stopped {
            asked,
            bytes,
            total,
        } => {
            assert_eq!(asked, Asked::Pause);
            assert!(bytes.is_empty(), "there is nothing to hand back yet");
            assert!(total.is_none(), "and no length was ever announced");
        }
        _ => panic!("a pause was asked for and not obeyed"),
    }
    assert!(
        asked.lock().expect("the offsets are shared").is_empty(),
        "and the server was never asked for anything"
    );
}

/// The whole delivery path against the real endpoint, on demand.
///
/// Run with `cargo test -- --ignored`. It fetches an installer of some tens of
/// megabytes over whatever link this machine has, which is not something a test
/// suite should do — but it is the only thing that says the resuming download
/// works on a link that drops connections, and that the published signature
/// verifies against the published key. Nothing smaller can say either.
#[test]
#[ignore]
fn the_published_release_downloads_and_verifies() {
    let config = published_config();
    let started = std::time::Instant::now();
    let (bytes, version) = tauri::async_runtime::block_on(async {
        let client = super::download::client("Enjoy acceptance").expect("a client can be built");
        let manifest: serde_json::Value = client
            .get(config.endpoints[0].clone())
            .send()
            .await
            .expect("the release endpoint answers")
            .json()
            .await
            .expect("the manifest is JSON");
        let version = manifest["version"]
            .as_str()
            .expect("the manifest names a version")
            .to_string();
        let platform = manifest["platforms"]["windows-x86_64-nsis"]
            .as_object()
            .or_else(|| manifest["platforms"]["windows-x86_64"].as_object())
            .expect("the manifest names a Windows installer");
        let url = platform["url"].as_str().expect("the asset has a url");
        let signature = platform["signature"]
            .as_str()
            .expect("the asset has a signature");
        let url = url.parse().expect("the asset url is a url");
        let bytes = match fetch(&client, &url, Vec::new(), &StopFlag::default(), |_, _| {}).await {
            Transfer::Complete(bytes) => bytes,
            Transfer::Failed { error, .. } => panic!("the asset arrives: {error}"),
            Transfer::Stopped { .. } => panic!("nothing asked this transfer to stop"),
        };
        verify(&bytes, signature, &config.pubkey).expect("the asset is the signed one");
        (bytes, version)
    });
    println!(
        "downloaded and verified v{version}: {} bytes in {:?}",
        bytes.len(),
        started.elapsed()
    );
    assert!(!bytes.is_empty());
}

/// The updater block out of the bundled configuration, the way the plugin reads
/// it — the same source the running app takes the endpoint and the key from.
fn published_config() -> tauri_plugin_updater::Config {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json");
    let raw = std::fs::read_to_string(path).expect("the Tauri configuration is readable");
    let config: serde_json::Value =
        serde_json::from_str(&raw).expect("the Tauri configuration is valid JSON");
    serde_json::from_value(
        config
            .get("plugins")
            .and_then(|plugins| plugins.get("updater"))
            .cloned()
            .expect("tauri.conf.json declares plugins.updater"),
    )
    .expect("plugins.updater matches the updater schema")
}
