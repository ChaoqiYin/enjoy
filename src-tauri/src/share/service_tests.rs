//! The service as a device on the network meets it: a socket, a request written
//! out by hand, and the bytes that come back.
//!
//! Nothing here goes through the application. What it is checking is exactly
//! what cannot be checked from inside — that the port is really open, that a
//! browser and a WebDAV client are really given different answers on the same
//! path, that a range request really comes back as a slice, that the write
//! methods really do nothing to the disk, and that ending the service really
//! gives the port back.
//!
//! This is also the only place a claim about the WebDAV library itself can be
//! made: it is somebody else's understanding of the protocol, and the only way
//! to observe it is to speak the protocol to it.

use std::io::{Read, Write};
use std::net::TcpStream;

use crate::repository::fixture::Fixture;

use super::control::ShareControl;
use super::fixture::{encoded, listing, path_of};

/// One request over a real connection, read back to the last byte.
///
/// `Connection: close` is what makes reading to the end the right way to read
/// the answer: the server closes the connection when it is done, and until then
/// there is nothing to say it is finished.
fn ask(port: u16, request: &str) -> Vec<u8> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.write_all(request.as_bytes()).unwrap();
    let mut response = Vec::new();
    stream.read_to_end(&mut response).unwrap();
    response
}

fn request(port: u16, method: &str, path: &str, headers: &str) -> Vec<u8> {
    ask(
        port,
        &format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n{headers}\r\n"
        ),
    )
}

fn get(port: u16, path: &str) -> Vec<u8> {
    request(port, "GET", path, "")
}

/// Everything above the blank line, as text.
fn head_of(response: &[u8]) -> String {
    let end = split_at(response).0;
    String::from_utf8_lossy(&response[..end]).into_owned()
}

/// The status line's number.
fn status(response: &[u8]) -> u16 {
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
fn body_of(response: &[u8]) -> Vec<u8> {
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
fn split_at(response: &[u8]) -> (usize, &[u8]) {
    let end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("a response has a blank line between its headers and its body")
        + 4;
    (end, &response[end..])
}

/// A service over nothing, for the answers that are not about the list.
fn started(language: &str) -> (ShareControl, u16) {
    serving_from(Vec::new(), language)
}

/// A service over a real list, and the directory the files are in.
fn serving(names: &[&str]) -> (Fixture, ShareControl, u16) {
    let (fixture, paths) = listing(names);
    let (control, port) = serving_from(paths, "en");
    (fixture, control, port)
}

fn serving_from(paths: Vec<String>, language: &str) -> (ShareControl, u16) {
    let control = ShareControl::default();
    let port = control
        .open(None, language, &paths)
        .unwrap()
        .port
        .expect("a started service has a port");
    (control, port)
}

#[test]
fn a_browser_opening_the_address_is_shown_a_page_rather_than_a_listing() {
    let (control, port) = started("en");
    let response = get(port, "/");
    assert_eq!(status(&response), 200);
    let head = head_of(&response);
    assert!(
        head.to_ascii_lowercase()
            .contains("content-type: text/html"),
        "{head}"
    );
    // The words the reader is meant to find, which is the whole of what this
    // answer is for. Not XML, not a folder listing.
    let body = String::from_utf8_lossy(&body_of(&response)).into_owned();
    assert!(body.contains("Enjoy share service"), "{body}");
    assert!(!body.contains("<?xml"), "{body}");
    control.close();
}

#[test]
fn a_webdav_client_on_the_same_path_is_answered_by_the_library() {
    let (control, port) = started("en");
    let response = request(port, "PROPFIND", "/", "Depth: 1\r\nContent-Length: 0\r\n");
    // A multi-status listing, which is the protocol's own answer and not the
    // page a browser gets.
    assert_eq!(status(&response), 207);
    let body = String::from_utf8_lossy(&body_of(&response)).into_owned();
    assert!(!body.contains("Enjoy share service"), "{body}");
    control.close();
}

#[test]
fn the_service_keeps_answering_until_it_is_ended() {
    let (control, port) = started("en");
    assert_eq!(status(&get(port, "/")), 200);
    assert_eq!(status(&get(port, "/")), 200);

    control.close();
    // Nothing is listening any more, so the connection is not merely unanswered
    // -- there is nothing to answer it.
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn the_page_is_written_in_the_language_the_application_is_being_read_in() {
    let (control, port) = started("zh-CN");
    let body = String::from_utf8_lossy(&body_of(&get(port, "/"))).into_owned();
    assert!(body.contains("Enjoy 共享服务"), "{body}");
    control.close();
}

#[test]
fn a_client_listing_the_root_sees_one_flat_row_of_videos() {
    let (_fixture, control, port) =
        serving(&["Movies/开场.mp4", "Archive/开场.mp4", "Archive/花絮.mkv"]);
    let response = request(port, "PROPFIND", "/", "Depth: 1\r\nContent-Length: 0\r\n");
    assert_eq!(status(&response), 207);
    let body = String::from_utf8_lossy(&body_of(&response)).into_owned();
    // Every video the user picked, under the name it is served by -- the second
    // one numbered, because it wanted a name the first one already had.
    for name in ["开场.mp4", "开场（1）.mp4", "花絮.mkv"] {
        assert!(
            body.contains(&encoded(name)),
            "{name} is missing from {body}"
        );
    }
    // And none of the directories they came from: what a client sees is one
    // level, with nothing to click into.
    for folder in ["Movies", "Archive"] {
        assert!(!body.contains(folder), "{folder} leaked into {body}");
    }
    control.close();
}

#[test]
fn a_range_request_gets_the_slice_that_was_asked_for() {
    let (fixture, control, port) = serving(&["Movies/开场.mp4"]);
    let content = std::fs::read(path_of(&fixture, "Movies/开场.mp4")).unwrap();
    let response = request(
        port,
        "GET",
        &format!("/{}", encoded("开场.mp4")),
        "Range: bytes=2-5\r\n",
    );

    // A player dragging its position bar asks for the middle of a film, and this
    // is the answer it decides whether it can keep playing on.
    assert_eq!(status(&response), 206);
    let head = head_of(&response);
    assert!(
        head.to_ascii_lowercase()
            .contains(&format!("content-range: bytes 2-5/{}", content.len())),
        "{head}"
    );
    assert_eq!(body_of(&response), content[2..6]);
    control.close();
}

#[test]
fn the_service_refuses_to_be_written_to_and_leaves_the_disk_alone() {
    let (fixture, control, port) = serving(&["Movies/开场.mp4"]);
    let shared = path_of(&fixture, "Movies/开场.mp4");
    let before = std::fs::read(&shared).unwrap();
    let name = format!("/{}", encoded("开场.mp4"));

    let attempts = [
        // Overwriting a video that is on the list, and creating one that is not.
        request(port, "PUT", &name, "Content-Length: 3\r\n\r\nnew"),
        request(port, "PUT", "/new.mp4", "Content-Length: 3\r\n\r\nnew"),
        request(port, "DELETE", &name, ""),
        request(port, "MKCOL", "/new-folder", "Content-Length: 0\r\n"),
        request(port, "MOVE", &name, "Destination: /moved.mp4\r\n"),
    ];
    for response in attempts {
        assert!(
            status(&response) >= 400,
            "a write was answered with {}",
            status(&response)
        );
    }
    // Nothing on the disk moved, changed, or came into being.
    assert_eq!(std::fs::read(&shared).unwrap(), before);
    assert!(!fixture.0.join("Movies").join("moved.mp4").exists());
    assert!(!fixture.0.join("new.mp4").exists());
    assert!(!fixture.0.join("new-folder").exists());
    control.close();
}

#[test]
fn a_video_that_is_no_longer_on_disk_is_counted_and_not_offered() {
    let (fixture, mut paths) = listing(&["Movies/开场.mp4"]);
    let gone = fixture.0.join("Archive").join("花絮.mkv");
    paths.push(gone.to_string_lossy().into_owned());
    let control = ShareControl::default();

    // The count is the answer to "why does the television show fewer videos than
    // I picked", so it is part of what starting the service reports.
    let status_of_start = control.open(None, "en", &paths).unwrap();
    assert_eq!(status_of_start.missing_files, 1);
    let port = status_of_start.port.unwrap();

    let body = String::from_utf8_lossy(&body_of(&request(
        port,
        "PROPFIND",
        "/",
        "Depth: 1\r\nContent-Length: 0\r\n",
    )))
    .into_owned();
    assert!(!body.contains(&encoded("花絮.mkv")), "{body}");

    control.close();
    assert_eq!(control.status().missing_files, 0);
}

#[test]
fn a_request_for_something_outside_the_list_is_not_found() {
    let (fixture, control, port) = serving(&["Movies/开场.mp4"]);
    // A file that is really there, beside the one that was picked.
    std::fs::write(fixture.0.join("outside.mp4"), b"not picked").unwrap();
    let shared = encoded("开场.mp4");

    for path in [
        // Not on the list, though it is on the disk.
        "/outside.mp4".to_string(),
        // The path the video really has, which is not the one it is served by.
        format!("/Movies/{shared}"),
        // The escaping shapes, which name nothing either.
        "/a/../outside.mp4".to_string(),
        "//outside.mp4".to_string(),
    ] {
        assert_eq!(status(&get(port, &path)), 404, "{path}");
    }
    // And the one that is on the list is served.
    assert_eq!(status(&get(port, &format!("/{shared}"))), 200);
    control.close();
}
