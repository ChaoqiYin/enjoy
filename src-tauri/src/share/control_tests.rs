//! The control layer: whether a service is running, and what the interface is
//! told about it.
//!
//! The same shape as the other test files beside their modules — the tests for
//! [`super::control`] live here rather than inside it, which is what keeps the
//! module about ports and threads and nothing else. Some of these hold a real
//! port: what "the port is free once the service has ended" means cannot be
//! answered without a socket.

use super::addresses::Address;
use super::control::ShareControl;
use super::credentials::Credentials;
use super::service::PORT_ATTEMPTS;
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::time::Duration;

/// The credentials every test here starts a service under.
fn credentials() -> Credentials {
    Credentials {
        username: "enjoy".to_string(),
        password: "treasure".to_string(),
    }
}

/// Everything, on every interface, which is where the service listens.
fn anywhere(port: u16) -> SocketAddr {
    SocketAddr::from((Ipv4Addr::UNSPECIFIED, port))
}

/// A port nothing holds, taken from the system and then given back. Handing
/// a test a port number the system chose a moment ago is the only way to
/// name a port in advance without also owning it.
fn a_port_nothing_holds() -> u16 {
    let listener = TcpListener::bind(anywhere(0)).unwrap();
    listener.local_addr().unwrap().port()
}

/// A run of consecutive ports this test holds, and nothing else does.
///
/// A consecutive run is what the service searches through, so a test about
/// finding none free needs one to hold. Looked for rather than chosen: a
/// number written down here is a number something else on the machine may
/// already have, and the test would then be measuring the wrong thing.
fn a_run_of_free_ports(length: u16) -> Vec<TcpListener> {
    for _ in 0..100 {
        let Ok(first) = TcpListener::bind(anywhere(0)) else {
            continue;
        };
        let base = first.local_addr().unwrap().port();
        // A run that reaches past the last port there is would loop for
        // ever waiting for one.
        if base > u16::MAX - length {
            continue;
        }
        let mut run = vec![first];
        for offset in 1..length {
            match TcpListener::bind(anywhere(base + offset)) {
                Ok(listener) => run.push(listener),
                // Somebody holds one of them: start again from another base.
                Err(_) => break,
            }
        }
        if run.len() == usize::from(length) {
            return run;
        }
    }
    panic!("no run of {length} consecutive ports was free");
}

/// Whether anything answers on this port.
///
/// Asked by connecting rather than by binding, because binding is not the
/// same question everywhere: on Windows a bind to one address succeeds while
/// another socket holds the wildcard for that port, so a listener that
/// probes by binding would report a port free while the service was using
/// it. A connection is answered by whoever is listening, on every platform.
fn listening(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        Duration::from_millis(500),
    )
    .is_ok()
}

#[test]
fn the_status_answers_without_starting_anything() {
    let control = ShareControl::default();
    assert_eq!(control.status(&credentials(), Vec::new(), &[]).port, None);
    let port = a_port_nothing_holds();
    // Reading the status started nothing: asking twice did not open
    // anything, and the port the status would have taken is still quiet.
    assert_eq!(control.status(&credentials(), Vec::new(), &[]).port, None);
    assert!(!listening(port));
}

#[test]
fn the_status_carries_the_credentials_the_interface_has_to_show() {
    let control = ShareControl::default();
    let credentials = credentials();
    let status = control.status(&credentials, Vec::new(), &[]);
    assert_eq!(status.username, "enjoy");
    assert_eq!(status.password, "treasure");
    // Nothing is running, so there is nothing that could be out of date.
    assert!(!status.needs_restart);
}

#[test]
fn a_service_starts_ends_and_leaves_the_port_behind_it_free() {
    let control = ShareControl::default();
    let credentials = credentials();
    let started = control
        .open(None, "en", &[], credentials.clone(), Vec::new())
        .unwrap();
    let port = started.port.expect("a service that started has a port");
    assert_eq!(
        control.status(&credentials, Vec::new(), &[]).port,
        Some(port)
    );
    assert!(listening(port));

    assert_eq!(control.close(&credentials, Vec::new()).port, None);
    assert_eq!(control.status(&credentials, Vec::new(), &[]).port, None);
    // The port comes back because the thread serving it has ended by the
    // time `close` returns, not at some later point nobody waited for. This
    // is the assertion the whole thread-and-runtime arrangement is for.
    assert!(!listening(port));
}

#[test]
fn a_password_regenerated_under_a_running_service_is_one_it_does_not_accept() {
    let control = ShareControl::default();
    let old = credentials();
    // The user pressed 重新生成: the stored password is now a different one,
    // and the service still holds the one it started with.
    let new = Credentials {
        password: "doubloons".to_string(),
        ..old.clone()
    };
    let port = control
        .open(None, "en", &[], old, Vec::new())
        .unwrap()
        .port
        .unwrap();
    let status = control.status(&new, Vec::new(), &[]);
    assert!(status.needs_restart);
    // What the interface is shown is the new password, because that is the
    // one the user will need after they do what the status tells them to.
    assert_eq!(status.password, "doubloons");
    assert_eq!(status.port, Some(port));

    // Restarting it is what settles the difference, and the service that
    // comes back is behind the new password: the old one is gone rather than
    // both being accepted.
    control.close(&new, Vec::new());
    assert!(!control.status(&new, Vec::new(), &[]).needs_restart);
    control
        .open(Some(port), "en", &[], new.clone(), Vec::new())
        .unwrap();
    assert!(!control.status(&new, Vec::new(), &[]).needs_restart);
    control.close(&new, Vec::new());
}

#[test]
fn the_same_port_can_be_taken_again_after_ending_and_taking_it() {
    let control = ShareControl::default();
    let credentials = credentials();
    // A port the test names, so that the second start is known to be
    // reaching for the same one rather than for whatever the system offers.
    let requested = a_port_nothing_holds();
    assert_eq!(
        control
            .open(Some(requested), "en", &[], credentials.clone(), Vec::new())
            .unwrap()
            .port,
        Some(requested)
    );
    control.close(&credentials, Vec::new());
    assert_eq!(
        control
            .open(Some(requested), "en", &[], credentials.clone(), Vec::new())
            .unwrap()
            .port,
        Some(requested)
    );
    control.close(&credentials, Vec::new());
}

#[test]
fn a_second_service_is_refused_while_one_is_running() {
    let control = ShareControl::default();
    let credentials = credentials();
    let running = control
        .open(None, "en", &[], credentials.clone(), Vec::new())
        .unwrap();
    let refused = control
        .open(None, "en", &[], credentials.clone(), Vec::new())
        .unwrap_err();
    assert_eq!(refused.code, "share.already_running");
    // Refused, and the running one untouched: the slot is not closed behind
    // a service that is still serving.
    assert_eq!(
        control.status(&credentials, Vec::new(), &[]).port,
        running.port
    );
    control.close(&credentials, Vec::new());
}

#[test]
fn a_port_something_else_holds_is_passed_over_rather_than_refused() {
    // Held on every interface, which is where the service would take it.
    // Whatever else on the machine wants 4918 -- another video server, a
    // developer's own running copy -- is not a reason the user cannot share,
    // and it must not be: the interface shows the port that was taken, so a
    // port taken from it is a service nobody is told how to reach.
    let held = TcpListener::bind(anywhere(0)).unwrap();
    let port = held.local_addr().unwrap().port();
    let control = ShareControl::default();
    let started = control.open(Some(port), "en", &[], credentials(), Vec::new());
    let taken = started
        .unwrap()
        .port
        .expect("a service that started has a port");

    assert!(
        taken > port,
        "{taken} is not past the port it was asked for"
    );
    assert!(listening(taken));
    // And the port it passed over is still the other program's.
    assert!(listening(port));
    control.close(&credentials(), Vec::new());
    // Ending gives back the one it took, and leaves the held one alone.
    assert!(!listening(taken));
    assert!(listening(port));
}

#[test]
fn a_run_of_ports_all_held_is_refused_and_named() {
    // The range is ten ports from the one asked for, so ten listeners in a
    // row is the whole of what can be taken. Found by looking for a run the
    // system will give up rather than by naming one, since a port this test
    // picked could be one something else already holds -- which is the very
    // thing being tested for.
    let held = a_run_of_free_ports(PORT_ATTEMPTS);
    let base = held.first().unwrap().local_addr().unwrap().port();
    let control = ShareControl::default();
    let refused = control
        .open(Some(base), "en", &[], credentials(), Vec::new())
        .unwrap_err();
    assert_eq!(refused.code, "share.port.in_use");
    // Both numbers travel with the failure: the message that names the port
    // and says how many were tried is written in one place and read here.
    assert_eq!(
        refused.params.get("port").map(String::as_str),
        Some(base.to_string().as_str())
    );
    assert_eq!(
        refused.params.get("count").map(String::as_str),
        Some(PORT_ATTEMPTS.to_string().as_str())
    );
    // A failure leaves nothing behind it.
    assert_eq!(control.status(&credentials(), Vec::new(), &[]).port, None);
}

#[test]
fn a_list_added_to_under_a_running_service_is_one_it_is_not_offering() {
    let control = ShareControl::default();
    let credentials = credentials();
    let started = vec!["/movies/a.mp4".to_string()];
    control
        .open(None, "en", &started, credentials.clone(), Vec::new())
        .unwrap();
    // The list as it was is what is being served, and saying so is what
    // keeps the interface quiet about a change nobody made.
    assert!(
        !control
            .status(&credentials, Vec::new(), &started)
            .list_changed
    );

    let one_more = vec!["/movies/a.mp4".to_string(), "/movies/b.mp4".to_string()];
    assert!(
        control
            .status(&credentials, Vec::new(), &one_more)
            .list_changed
    );
    // And the same list in a different order is a different list: what a
    // client is shown is the order, so a reordering is a change too.
    let reordered = vec!["/movies/b.mp4".to_string(), "/movies/a.mp4".to_string()];
    assert!(
        control
            .status(&credentials, Vec::new(), &reordered)
            .list_changed
    );

    // Nothing running means nothing is being offered, so there is no list to
    // be out of step with the space's.
    control.close(&credentials, Vec::new());
    assert!(
        !control
            .status(&credentials, Vec::new(), &one_more)
            .list_changed
    );
}

#[test]
fn the_status_carries_the_machine_s_own_addresses_through() {
    let control = ShareControl::default();
    let here = Address {
        interface: "Wi-Fi".to_string(),
        address: Ipv4Addr::new(192, 168, 1, 5),
        loopback: false,
    };
    // The addresses are the caller's to read and the answer's to carry:
    // where this machine can be reached is not something this module finds
    // out, and a status that dropped them would be a page with a port and
    // nothing to put it on.
    let status = control.status(&credentials(), vec![here.clone()], &[]);
    assert_eq!(status.addresses, vec![here]);
}
