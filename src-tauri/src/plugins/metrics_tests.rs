//! What the status line and the diagnostics read: every call, what it cost, and
//! how it ended.

use std::time::Duration;

use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points;
use crate::plugins::CallOutcome;

#[test]
fn every_call_is_written_down_with_what_it_cost() {
    let (host, _) = fixture::host();
    host.enable(
        "slow",
        FakeBody::slow(
            fixture::fields(&[("cover", "/slow.jpg")]),
            Duration::from_millis(20),
        ),
    );
    host.enable(
        "quick",
        FakeBody::answering(fixture::fields(&[("rating", "5")])),
    );

    host.video_fields(&fixture::space(), &fixture::video());

    let calls = host.calls();
    assert_eq!(
        calls
            .iter()
            .map(|call| (call.plugin.as_str(), call.mount_point, call.outcome))
            .collect::<Vec<_>>(),
        vec![
            ("slow", mount_points::VIDEO_FIELDS, CallOutcome::Answered),
            ("quick", mount_points::VIDEO_FIELDS, CallOutcome::Answered),
        ],
        "one line per call, in the order they were made"
    );
    assert!(
        calls[0].elapsed >= Duration::from_millis(20),
        "the call that took 20ms is recorded as having taken at least that long: {:?}",
        calls[0].elapsed
    );
    assert!(
        calls[0].elapsed > calls[1].elapsed,
        "the two calls are not all reported as taking the same time: {:?}",
        calls
    );
}

#[test]
fn a_call_that_failed_is_written_down_as_one() {
    let (host, _) = fixture::host();
    host.enable("broken", FakeBody::failing());

    host.scan_completed(&fixture::space(), &[fixture::video()]);

    let calls = host.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].plugin, "broken");
    assert_eq!(calls[0].mount_point, mount_points::SCAN_COMPLETED);
    assert_eq!(calls[0].outcome, CallOutcome::Failed);
}

#[test]
fn the_history_of_calls_does_not_grow_without_bound() {
    let (host, _) = fixture::host();
    host.enable("one", FakeBody::answering(fixture::fields(&[])));

    for _ in 0..500 {
        host.video_fields(&fixture::space(), &fixture::video());
    }

    let calls = host.calls();
    assert!(
        calls.len() <= 200,
        "a mount point asked on every render cannot leave a history that grows with the library: {}",
        calls.len()
    );
    assert_eq!(
        calls.last().unwrap().plugin,
        "one",
        "what is kept is the recent past, not the first calls ever made"
    );
}
