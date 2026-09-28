//! What the service remembers about who asked.
//!
//! Two halves, and they are the same rule seen from either end: the list is
//! built out of requests, and requests are made over a real connection. The
//! first half drives [`super::activity`] directly, which is what makes the
//! minute-long window something a test can step over rather than wait out; the
//! second half goes through the service, which is what makes it true that a
//! request on the wire is what puts a client on the list.

use std::net::{IpAddr, Ipv4Addr};
use std::time::{Duration, SystemTime};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use http::HeaderValue;

use super::activity::{Activity, Device, WINDOW};
use super::harness::{credentials, get, raw_request, request, started, status};
use crate::ports::the_machine_ports;

fn address(last: u8) -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(192, 168, 1, last))
}

fn agent(value: &str) -> HeaderValue {
    HeaderValue::from_str(value).unwrap()
}

#[test]
fn a_client_is_listed_under_the_name_it_gives_itself() {
    assert_eq!(
        super::activity::device_name(Some(&agent("VLC/3.0.20 LibVLC/3.0.20"))).as_deref(),
        Some("VLC/3.0.20")
    );
    assert_eq!(
        super::activity::device_name(Some(&agent("Infuse/7.6.4 (iPhone; iOS 17.4)"))).as_deref(),
        Some("Infuse/7.6.4")
    );
    // A name and nothing else, which some clients send.
    assert_eq!(
        super::activity::device_name(Some(&agent("Infuse"))).as_deref(),
        Some("Infuse")
    );
}

#[test]
fn a_client_that_says_nothing_usable_is_still_a_client() {
    for nothing in [None, Some(&agent("")), Some(&agent("   "))] {
        assert_eq!(super::activity::device_name(nothing), None, "{nothing:?}");
    }
    // Long enough to push the rest of the row off the screen, and kept to the
    // part of it that is a name.
    let enormous = "x".repeat(400);
    let name = super::activity::device_name(Some(&agent(&enormous))).unwrap();
    assert_eq!(name.len(), 64);
}

#[test]
fn an_entry_is_dropped_once_the_window_has_passed() {
    let activity = Activity::default();
    activity.saw(address(5), Some(&agent("VLC/3.0.20")));
    let now = SystemTime::now();

    // Inside the window, and at the last moment of it.
    assert_eq!(activity.recent(now).len(), 1);
    assert_eq!(
        activity.recent(now + WINDOW - Duration::from_secs(1)).len(),
        1
    );
    // And past it, gone. Asked at a moment later than the request rather than
    // waited for, which is the whole reason the moment is a parameter.
    assert!(activity.recent(now + WINDOW).is_empty());
}

#[test]
fn a_client_that_comes_back_is_the_same_row_and_moves_to_the_top() {
    let activity = Activity::default();
    let now = SystemTime::now();
    // Two clients, one of them heard from again after the other.
    activity.saw(address(5), Some(&agent("VLC/3.0.20")));
    let first = activity.recent(now);
    activity.saw(address(9), Some(&agent("Infuse/7.6.4")));
    activity.saw(address(5), Some(&agent("VLC/3.0.20")));

    let devices = activity.recent(now + Duration::from_secs(1));
    assert_eq!(devices.len(), 2, "a second request opened a second row");
    assert_eq!(devices[0].address, address(5));
    assert_eq!(devices[1].address, address(9));
    // The one that came back is the row it was, timed from the request that
    // came back: it is one client that made two requests.
    assert!(devices[0].last_seen >= first[0].last_seen);
    assert_eq!(devices[0].name.as_deref(), Some("VLC/3.0.20"));
}

#[test]
fn a_client_that_stops_naming_itself_keeps_the_name_it_gave() {
    let activity = Activity::default();
    activity.saw(address(5), Some(&agent("VLC/3.0.20")));
    // A second request with no User-Agent at all, which is what a client that
    // sends the header only on the first request of a session looks like. The
    // row does not lose the name it was listed under.
    activity.saw(address(5), None);
    let devices = activity.recent(SystemTime::now());
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].name.as_deref(), Some("VLC/3.0.20"));
}

#[test]
fn the_list_carries_the_address_and_the_moment_it_was_heard_from() {
    let activity = Activity::default();
    let before = super::activity::milliseconds(SystemTime::now());
    activity.saw(address(5), Some(&agent("VLC/3.0.20")));
    let devices: Vec<Device> = activity.recent(SystemTime::now());
    let device = &devices[0];
    assert_eq!(device.address, address(5));
    assert!(
        device.last_seen >= before,
        "{} was before {}",
        device.last_seen,
        before
    );
}

#[test]
fn a_client_that_gets_in_is_listed_under_the_name_it_gives_itself() {
    let _ports = the_machine_ports();
    let (control, port) = started("en");
    assert!(control
        .status(&credentials(), Vec::new(), &[])
        .devices
        .is_empty());
    request(port, "GET", "/", "User-Agent: VLC/3.0.20 LibVLC/3.0.20\r\n");
    request(port, "PROPFIND", "/", "Depth: 1\r\nContent-Length: 0\r\n");

    let devices = control.status(&credentials(), Vec::new(), &[]).devices;
    // One row for two requests: a client is a client, not a request.
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].address, IpAddr::V4(Ipv4Addr::LOCALHOST));
    assert_eq!(devices[0].name.as_deref(), Some("VLC/3.0.20"));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    // Dated, so that the page can say how long ago it was, and never in the
    // future by more than the clock this test was read against.
    assert!(
        devices[0].last_seen <= now,
        "{} > {now}",
        devices[0].last_seen
    );
    assert!(devices[0].last_seen > now - 60_000);
    control.close(&credentials(), Vec::new());
    // Ending the service ends the list with it: nobody is connected to a
    // service that is not there.
    assert!(control
        .status(&credentials(), Vec::new(), &[])
        .devices
        .is_empty());
}

#[test]
fn a_client_that_says_nothing_about_itself_is_still_listed() {
    let _ports = the_machine_ports();
    let (control, port) = started("en");
    request(port, "GET", "/", "");
    // Named or not, the address and the moment are what the row is made of, and
    // a client that sends no User-Agent still has both.
    let devices = control.status(&credentials(), Vec::new(), &[]).devices;
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].address, IpAddr::V4(Ipv4Addr::LOCALHOST));
    assert_eq!(devices[0].name, None);
    control.close(&credentials(), Vec::new());
}

#[test]
fn a_device_that_never_got_past_the_password_is_not_a_client() {
    let _ports = the_machine_ports();
    let (control, port) = started("en");
    let response = raw_request(
        port,
        "GET",
        "/",
        &format!(
            "Authorization: Basic {}\r\n",
            BASE64.encode("enjoy:doubloons")
        ),
    );
    assert_eq!(status(&response), 401);
    assert!(
        control
            .status(&credentials(), Vec::new(), &[])
            .devices
            .is_empty(),
        "a refused request was listed as a client"
    );
    // And the same address, with the password, is listed: what was left out is
    // the request that was refused, not the device.
    assert_eq!(status(&get(port, "/")), 200);
    assert_eq!(
        control
            .status(&credentials(), Vec::new(), &[])
            .devices
            .len(),
        1
    );
    control.close(&credentials(), Vec::new());
}
