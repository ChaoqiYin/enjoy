//! The service as a device on the network meets it: a socket, a request written
//! out by hand, and the bytes that come back.
//!
//! Nothing here goes through the application. What it is checking is exactly
//! what cannot be checked from inside — that the port is really open, that a
//! browser and a WebDAV client are really given different answers on the same
//! path, and that ending the service really gives the port back.

use std::io::{Read, Write};
use std::net::TcpStream;

use super::control::ShareControl;

/// One request over a real connection, read back to the last byte.
///
/// `Connection: close` is what makes reading to the end the right way to read
/// the answer: the server closes the connection when it is done, and until then
/// there is nothing to say it is finished.
fn ask(port: u16, request: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.write_all(request.as_bytes()).unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
}

fn request(port: u16, method: &str, path: &str) -> String {
    ask(
        port,
        &format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
    )
}

/// The port a started service is on, in the shape the assertions below want it.
fn started(language: &str) -> (ShareControl, u16) {
    let control = ShareControl::default();
    let port = control
        .open(None, language)
        .unwrap()
        .port
        .expect("a started service has a port");
    (control, port)
}

#[test]
fn a_browser_opening_the_address_is_shown_a_page_rather_than_a_listing() {
    let (control, port) = started("en");
    let response = request(port, "GET", "/");
    assert!(response.starts_with("HTTP/1.1 200"), "{response}");
    assert!(
        response
            .to_ascii_lowercase()
            .contains("content-type: text/html"),
        "{response}"
    );
    // The words the reader is meant to find, which is the whole of what this
    // answer is for. Not XML, not a folder listing.
    assert!(response.contains("Enjoy share service"), "{response}");
    assert!(!response.contains("<?xml"), "{response}");
    control.close();
}

#[test]
fn a_webdav_client_on_the_same_path_is_answered_by_the_library() {
    let (control, port) = started("en");
    let response = request(port, "PROPFIND", "/");
    // The listing itself arrives with the slice that fills the filesystem; what
    // this holds now is that the request reached the protocol handler at all,
    // and that the handler produced the answer -- the page a browser gets is
    // not it, and a connection that never reached anything would not answer at
    // all. A path the filesystem does not hold is a `404`, which is the
    // handler's own verdict.
    assert!(response.starts_with("HTTP/1.1 404"), "{response}");
    assert!(!response.contains("Enjoy share service"), "{response}");
    control.close();
}

#[test]
fn the_service_keeps_answering_until_it_is_ended() {
    let (control, port) = started("en");
    assert!(request(port, "GET", "/").starts_with("HTTP/1.1 200"));
    assert!(request(port, "GET", "/").starts_with("HTTP/1.1 200"));

    control.close();
    // Nothing is listening any more, so the connection is not merely unanswered
    // -- there is nothing to answer it.
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn the_page_is_written_in_the_language_the_application_is_being_read_in() {
    let (control, port) = started("zh-CN");
    let response = request(port, "GET", "/");
    assert!(response.contains("Enjoy 共享服务"), "{response}");
    control.close();
}
