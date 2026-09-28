//! The service as a device on the network meets it: a socket, a request written
//! out by hand, and the bytes that come back.
//!
//! What the tests built on this are checking is exactly what cannot be checked
//! from inside — that the port is really open, that a browser and a WebDAV
//! client are really given different answers on the same path, that a client
//! without the password is really refused and a client with it really served,
//! that a range request really comes back as a slice, that the write methods
//! really do nothing to the disk, and that ending the service really gives the
//! port back.
//!
//! This is also the only place a claim about the WebDAV library itself can be
//! made: it is somebody else's understanding of the protocol, and the only way
//! to observe it is to speak the protocol to it.
//!
//! Kept apart from the tests themselves because there is more than one file of
//! them — `service_tests` for what the service answers, `activity_tests` for
//! what it remembers about who asked — and a second copy of a request writer
//! would be a second thing to keep in step with the protocol.

use std::io::{Read, Write};
use std::net::TcpStream;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use crate::repository::fixture::Fixture;

use super::control::ShareControl;
use super::credentials::{Credentials, USERNAME};
use super::fixture::listing;

/// The password every service here is started under, and every client connects
/// with.
///
/// A value the test names rather than one the backend draws, because the point
/// of the tests below is a client that has been told the password and one that
/// has not: a drawn password would have to be read back out of the service to be
/// offered to it, and the request that offered it would then be the only thing
/// saying what it was.
pub(crate) fn password() -> String {
    "treasure".to_string()
}

pub(crate) fn credentials() -> Credentials {
    Credentials {
        username: USERNAME.to_string(),
        password: password(),
    }
}

/// The credential header a client that knows the password sends.
pub(crate) fn authorization() -> String {
    format!(
        "Authorization: Basic {}",
        BASE64.encode(format!("{}:{}", USERNAME, password()))
    )
}

/// One request over a real connection, read back to the last byte.
///
/// `Connection: close` is what makes reading to the end the right way to read
/// the answer: the server closes the connection when it is done, and until then
/// there is nothing to say it is finished.
pub(crate) fn ask(port: u16, request: &str) -> Vec<u8> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.write_all(request.as_bytes()).unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).unwrap();
    response
}

/// A request from a client that has been told the password, which is what every
/// test that is not about the password is asking as. The ones that are call
/// `ask` directly, so that what they send is visibly a request with nothing
/// added to it.
pub(crate) fn request(port: u16, method: &str, path: &str, headers: &str) -> Vec<u8> {
    ask(
        port,
        &format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             {}\r\n{headers}\r\n",
            authorization()
        ),
    )
}

pub(crate) fn get(port: u16, path: &str) -> Vec<u8> {
    request(port, "GET", path, "")
}

/// A request carrying exactly the headers it is given, with nothing added and
/// no credential of its own: how a client that got the password wrong offers it,
/// and how a test sends a request no helper has had a hand in.
pub(crate) fn raw_request(port: u16, method: &str, path: &str, headers: &str) -> Vec<u8> {
    ask(
        port,
        &format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
             {headers}\r\n"
        ),
    )
}

/// Everything above the blank line, as text.
pub(crate) fn head_of(response: &[u8]) -> String {
    let end = split_at(response).0;
    String::from_utf8_lossy(&response[..end]).into_owned()
}

/// The status line's number.
pub(crate) fn status(response: &[u8]) -> u16 {
    head_of(response)
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .expect("a response begins with a status line")
}

/// The body, with the chunk framing taken off if the server chose to use it.
///
/// A file has no length the handler can promise in advance, so hyper sends it
/// chunked; a page it can, so it does not. Both arrive here, and putting the
/// bytes back together is a dozen lines against one fewer assumption about what
/// the server decided to do.
pub(crate) fn body_of(response: &[u8]) -> Vec<u8> {
    let (end, body) = split_at(response);
    if !head_of(response)
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        return response[end..].to_vec();
    }
    let mut rest = body;
    let mut out = Vec::new();
    loop {
        let line = rest
            .windows(2)
            .position(|window| window == b"\r\n")
            .expect("a chunk begins with its length");
        let size = usize::from_str_radix(String::from_utf8_lossy(&rest[..line]).trim(), 16)
            .expect("a chunk length is hexadecimal");
        rest = &rest[line + 2..];
        if size == 0 {
            return out;
        }
        out.extend_from_slice(&rest[..size]);
        rest = &rest[size + 2..];
    }
}

/// Where the headers end, and the body starts.
pub(crate) fn split_at(response: &[u8]) -> (usize, &[u8]) {
    let end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("a response has a blank line between its headers and its body")
        + 4;
    (end, &response[end..])
}

/// A service over nothing, for the answers that are not about the list.
pub(crate) fn started(language: &str) -> (ShareControl, u16) {
    serving_from(Vec::new(), language)
}

/// A service over a real list, and the directory the files are in.
pub(crate) fn serving(names: &[&str]) -> (Fixture, ShareControl, u16) {
    let (fixture, paths) = listing(names);
    let (control, port) = serving_from(paths, "en");
    (fixture, control, port)
}

pub(crate) fn serving_from(paths: Vec<String>, language: &str) -> (ShareControl, u16) {
    let control = ShareControl::default();
    let port = control
        .open(None, language, &paths, credentials(), Vec::new())
        .unwrap()
        .port
        .expect("a started service has a port");
    (control, port)
}
