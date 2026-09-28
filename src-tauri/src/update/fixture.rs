//! What the update module's tests are built out of.
//!
//! Three things, each because it cannot be made any other way:
//!
//! * A **release** a test can hold ([`stand_in`]). The plugin's own has private
//!   fields and nothing outside the plugin can build one, which is why the rule
//!   that drops a download when a different version is offered had no test at
//!   all.
//! * A **signature** ([`key`]), because a valid minisign signature can only be
//!   made by the key that signs it and the key that signs our releases is not in
//!   this repository. What the tests prove is the part that matters: the
//!   verifier accepts a payload signed by the key it is given, and refuses
//!   everything else.
//! * A **server** ([`serve`]), because half of what a download does only happens
//!   when a connection ends early or a payload arrives in pieces.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::Url;
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};

use super::release::{AvailableUpdate, Release};

// ── a release ───────────────────────────────────────────────────────────────

/// A release a test can hold.
///
/// Everything the application asks a release about, answered from fields a test
/// sets — and the handover recorded rather than performed, since the real one
/// starts the platform installer and exits the process.
pub(crate) struct StandIn {
    version: String,
    url: Url,
    signature: String,
    installed: Mutex<Option<Vec<u8>>>,
}

impl StandIn {
    /// What the handover was given, if it was reached.
    pub(crate) fn installed(&self) -> Option<Vec<u8>> {
        self.installed.lock().unwrap().clone()
    }
}

impl Release for StandIn {
    fn version(&self) -> &str {
        &self.version
    }

    fn describe(&self) -> AvailableUpdate {
        AvailableUpdate {
            version: self.version.clone(),
            current_version: "0.1.0".into(),
            notes: None,
            date: None,
        }
    }

    fn download_url(&self) -> &Url {
        &self.url
    }

    fn signature(&self) -> &str {
        &self.signature
    }

    fn install(&self, bytes: &[u8]) -> Result<(), String> {
        *self.installed.lock().unwrap() = Some(bytes.to_vec());
        Ok(())
    }
}

/// A release offering `version`, fetched from `address`, answering to
/// `signature`.
pub(crate) fn stand_in(version: &str, address: &str, signature: &str) -> Arc<StandIn> {
    Arc::new(StandIn {
        version: version.into(),
        url: address.parse().expect("a test server address is a URL"),
        signature: signature.into(),
        installed: Mutex::new(None),
    })
}

// ── a signature ─────────────────────────────────────────────────────────────

/// Minisign's two algorithms: legacy (not prehashed) and prehashed. The plugin
/// accepts both, so the tests exercise the legacy one, which is the shape a
/// release signature made by `tauri signer` has.
const LEGACY: [u8; 2] = [0x45, 0x64];

/// The trusted comment the signature's second half is over, without its prefix.
const COMMENT: &str = "enjoy-test";

/// A key pair and the id a signature by it carries.
pub(crate) struct Key {
    pair: Ed25519KeyPair,
    id: [u8; 8],
}

/// A fresh key. Two calls make two different keys, which is what lets a test
/// sign with one and verify against another.
pub(crate) fn key(id: u8) -> Key {
    let pair = Ed25519KeyPair::from_pkcs8(
        Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
            .expect("a key pair can be generated")
            .as_ref(),
    )
    .expect("the generated pair is a key pair");
    Key { pair, id: [id; 8] }
}

/// The manifest's `pubkey` field: base64 around minisign's armoured text.
pub(crate) fn public_key_field(key: &Key) -> String {
    let mut blob = Vec::from(LEGACY);
    blob.extend_from_slice(&key.id);
    blob.extend_from_slice(key.pair.public_key().as_ref());
    let text = format!("untrusted comment: test key\n{}", BASE64.encode(blob));
    BASE64.encode(text)
}

/// The manifest's `signature` field, for a payload this key signs.
pub(crate) fn signature_field(key: &Key, payload: &[u8]) -> String {
    let signature = key.pair.sign(payload).as_ref().to_vec();
    let mut blob = Vec::from(LEGACY);
    blob.extend_from_slice(&key.id);
    blob.extend_from_slice(&signature);
    // Minisign signs the signature together with the trusted comment, so a
    // comment that has been edited invalidates the signature.
    let mut global = signature;
    global.extend_from_slice(COMMENT.as_bytes());
    let text = format!(
        "untrusted comment: test signature\n{}\ntrusted comment: {COMMENT}\n{}",
        BASE64.encode(blob),
        BASE64.encode(key.pair.sign(&global).as_ref())
    );
    BASE64.encode(text)
}

// ── a server ────────────────────────────────────────────────────────────────

/// A server on the loopback, and what it was asked for.
pub(crate) struct Server {
    pub(crate) address: String,
    /// The offset each connection asked to start at, in order. A test reads this
    /// to say not only that the bytes arrived but that they arrived by resuming.
    pub(crate) asked: Arc<Mutex<Vec<u64>>>,
}

impl Server {
    pub(crate) fn asked(&self) -> Vec<u64> {
        self.asked.lock().expect("the offsets are shared").clone()
    }
}

/// What a served connection does differently from handing the whole body over.
#[derive(Clone, Copy, Default)]
struct Behaviour {
    /// Cut the first answer short after this many bytes, so the announced length
    /// is never reached.
    cut: Option<usize>,
    /// Send this many bytes every this long, so a transfer is still running
    /// while a test reaches in and asks it to stop.
    pace: Option<(usize, Duration)>,
}

/// A server handing over `body`, answering ranges.
pub(crate) fn serve(body: Vec<u8>) -> Server {
    spawn(body, Behaviour::default())
}

/// A server whose first answer stops after `cut` bytes.
///
/// This is the connection the download loop exists for: one that dies partway
/// through with the length already announced.
pub(crate) fn serve_cut(body: Vec<u8>, cut: usize) -> Server {
    spawn(
        body,
        Behaviour {
            cut: Some(cut),
            pace: None,
        },
    )
}

/// A server that sends `chunk` bytes every `delay`, and takes as long as that
/// takes.
pub(crate) fn serve_slowly(body: Vec<u8>, chunk: usize, delay: Duration) -> Server {
    spawn(
        body,
        Behaviour {
            pace: Some((chunk, delay)),
            ..Behaviour::default()
        },
    )
}

fn spawn(body: Vec<u8>, behaviour: Behaviour) -> Server {
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
            let payload = match behaviour.cut.filter(|_| first) {
                Some(cut) => &rest[..cut.min(rest.len())],
                None => rest,
            };
            match behaviour.pace {
                Some((chunk, delay)) => {
                    for piece in payload.chunks(chunk.max(1)) {
                        if connection.write_all(piece).is_err() {
                            break;
                        }
                        let _ = connection.flush();
                        thread::sleep(delay);
                    }
                }
                None => {
                    let _ = connection.write_all(payload);
                }
            }
            // Dropping the connection is the failure a cut reproduces: the
            // announced length is never reached.
            let _ = connection.flush();
        }
    });
    Server { address, asked }
}

/// The whole request head off a connection, up to the blank line that ends it.
///
/// A server written for one test reads this to decide what to answer; the one
/// here reads it to find the range.
pub(crate) fn read_head(connection: &mut TcpStream) -> String {
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

/// A payload of `length` bytes that is not all one repeated value, so a test
/// comparing halves is comparing positions rather than a constant.
pub(crate) fn body(length: usize) -> Vec<u8> {
    (0..length).map(|index| (index % 251) as u8).collect()
}
