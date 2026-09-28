//! What the service answers, over a real connection.
//!
//! Every test here writes a request out by hand and reads the bytes back, using
//! the harness in [`super::harness`] for the socket and for a service to talk
//! to. Nothing goes through the application: what is being checked is the
//! protocol as a device on the network meets it.

use std::net::TcpStream;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::control::ShareControl;
use super::credentials::USERNAME;
use super::fixture::{encoded, listing, path_of};
use super::harness::{
    ask, body_of, credentials, get, head_of, password, raw_request, request, serving, started,
    status,
};
#[test]
fn a_request_that_offers_no_credentials_is_refused_and_told_which_scheme_to_use() {
    let (control, port) = started("en");
    // A person's browser asking for the page, and a client asking what is here.
    // Neither is answered: what is on the list is the user's business, and so is
    // whether the service is on at all.
    for method in ["GET", "PROPFIND"] {
        let response = ask(
            port,
            &format!("{method} / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
        );
        assert_eq!(status(&response), 401, "{method}");
        // The header is the whole of what makes the refusal usable: a client not
        // told the scheme has no way to ask the user for a password, and the
        // service would be one nothing could connect to.
        let head = head_of(&response).to_ascii_lowercase();
        assert!(
            head.contains("www-authenticate: basic realm=\"enjoy\""),
            "{head}"
        );
        // And nothing of the library came with it: the refusal is not a listing
        // with a 401 in front of it, and not the page either.
        let body = String::from_utf8_lossy(&body_of(&response)).into_owned();
        assert!(!body.contains("Enjoy share service"), "{body}");
        assert!(!body.contains("<?xml"), "{body}");
    }
    control.close(&credentials(), Vec::new());
}

#[test]
fn credentials_that_are_not_right_are_refused_the_same_way() {
    let (control, port) = started("en");
    for (name, offered) in [
        ("the wrong password", format!("{}:doubloons", USERNAME)),
        ("the wrong user name", format!("someone:{}", password())),
        // Right user name and right password, the wrong way round.
        (
            "the two the wrong way round",
            format!("{}:{}", password(), USERNAME),
        ),
        // Decodes to nothing that holds a user name and a password at all.
        ("no colon in it", "treasure".to_string()),
    ] {
        let header = format!("Authorization: Basic {}\r\n", BASE64.encode(offered));
        let response = raw_request(port, "GET", "/", &header);
        assert_eq!(status(&response), 401, "{name}");
        assert!(
            head_of(&response)
                .to_ascii_lowercase()
                .contains("www-authenticate"),
            "{name}"
        );
    }
    // And the credential that is right is not refused, so the four above are
    // about what was offered rather than about how this call was made.
    assert_eq!(status(&get(port, "/")), 200);
    control.close(&credentials(), Vec::new());
}

#[test]
fn the_password_that_is_right_is_served_both_of_the_answers_the_others_are_not() {
    // Both halves of what the service answers, reached with credentials: the
    // page a person is shown, and the listing a client is given. Without this
    // every test below would be proving that a service refuses everything.
    let (_fixture, control, port) = serving(&["Movies/开场.mp4"]);
    assert_eq!(status(&get(port, "/")), 200);
    let listing = request(port, "PROPFIND", "/", "Depth: 1\r\nContent-Length: 0\r\n");
    assert_eq!(status(&listing), 207);
    assert!(
        String::from_utf8_lossy(&body_of(&listing)).contains(&encoded("开场.mp4")),
        "the listing came back without the video on it"
    );
    control.close(&credentials(), Vec::new());
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
    control.close(&credentials(), Vec::new());
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
    control.close(&credentials(), Vec::new());
}

#[test]
fn the_service_keeps_answering_until_it_is_ended() {
    let (control, port) = started("en");
    assert_eq!(status(&get(port, "/")), 200);
    assert_eq!(status(&get(port, "/")), 200);

    control.close(&credentials(), Vec::new());
    // Nothing is listening any more, so the connection is not merely unanswered
    // -- there is nothing to answer it.
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn the_page_is_written_in_the_language_the_application_is_being_read_in() {
    let (control, port) = started("zh-CN");
    let body = String::from_utf8_lossy(&body_of(&get(port, "/"))).into_owned();
    assert!(body.contains("Enjoy 共享服务"), "{body}");
    control.close(&credentials(), Vec::new());
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
    control.close(&credentials(), Vec::new());
}

#[test]
fn the_listing_says_how_big_a_video_is() {
    // The number a client shows in its list, and the one a player reads before it
    // decides whether it can drag its position bar. A size a client cannot read
    // arrives as "unknown" — some clients print -1 byte — and a list of videos
    // that are all -1 byte looks like a service that is answering about files it
    // does not really have.
    let (fixture, control, port) = serving(&["Movies/开场.mp4"]);
    let size = std::fs::metadata(path_of(&fixture, "Movies/开场.mp4"))
        .unwrap()
        .len();
    let body = String::from_utf8_lossy(&body_of(&request(
        port,
        "PROPFIND",
        "/",
        "Depth: 1\r\nContent-Length: 0\r\n",
    )))
    .into_owned();
    assert!(
        body.contains(&format!("<D:getcontentlength>{size}</D:getcontentlength>")),
        "the listing did not say how big the video is: {body}"
    );
    // And the same number on the way in, whole and sliced: what a player opens
    // the file by, and what it asks for when it seeks.
    let file = format!("/{}", encoded("开场.mp4"));
    let whole = head_of(&request(port, "GET", &file, "")).to_ascii_lowercase();
    assert!(
        whole.contains(&format!("content-length: {size}")),
        "{whole}"
    );
    let slice = head_of(&request(port, "GET", &file, "Range: bytes=2-5\r\n")).to_ascii_lowercase();
    assert!(
        slice.contains(&format!("content-range: bytes 2-5/{size}")),
        "{slice}"
    );
    control.close(&credentials(), Vec::new());
}

#[test]
fn a_client_that_asks_without_a_depth_header_is_told_what_is_here() {
    // The header is the protocol's, not the client's: RFC 4918 has a client send
    // one and a server read a missing one as `infinity`. Not every client does
    // what the protocol says, and before the service filled it in, a request
    // without it reached the library as a listing of a resource's *children* —
    // so a video asked about this way came back inside a multi-status with no
    // `response` element in it at all. Nothing about the file, then: not its
    // size, not that it is a file. What a television showing `-1 byte` for every
    // video has to go on is exactly that emptiness.
    let (_fixture, control, port) = serving(&["Movies/开场.mp4"]);
    let file = format!("/{}", encoded("开场.mp4"));
    for (name, path, expected) in [
        // The listing, which is the same answer as with `Depth: 1`.
        ("the root", "/", "<D:collection>"),
        // And one file, which has no children to list and is what such a client
        // is asking about when it asks this way.
        ("one video", file.as_str(), "<D:getcontentlength>"),
    ] {
        let response = request(port, "PROPFIND", path, "Content-Length: 0\r\n");
        assert_eq!(status(&response), 207, "{name}");
        let body = String::from_utf8_lossy(&body_of(&response)).into_owned();
        assert!(
            body.contains(&encoded("开场.mp4")),
            "{name} came back without the video in it: {body}"
        );
        assert!(body.contains(expected), "{name}: {body}");
    }
    control.close(&credentials(), Vec::new());
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
    control.close(&credentials(), Vec::new());
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
    control.close(&credentials(), Vec::new());
}

#[test]
fn a_video_that_is_no_longer_on_disk_is_counted_and_not_offered() {
    let (fixture, mut paths) = listing(&["Movies/开场.mp4"]);
    let gone = fixture.0.join("Archive").join("花絮.mkv");
    paths.push(gone.to_string_lossy().into_owned());
    let control = ShareControl::default();

    // The count is the answer to "why does the television show fewer videos than
    // I picked", so it is part of what starting the service reports.
    let status_of_start = control
        .open(None, "en", &paths, credentials(), Vec::new())
        .unwrap();
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

    control.close(&credentials(), Vec::new());
    assert_eq!(
        control
            .status(&credentials(), Vec::new(), &[])
            .missing_files,
        0
    );
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
    control.close(&credentials(), Vec::new());
}
