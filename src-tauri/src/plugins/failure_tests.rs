//! What the kernel does with a plugin that failed.
//!
//! One rule, three ways of failing it, and one thing that must never happen:
//! the caller is not left without an answer, and nothing the kernel was doing
//! stops (ADR 0043 §5).

use std::sync::Arc;
use std::time::Duration;

use crate::plugins::fixture::{self, FakeBody};
use crate::plugins::mount_points::{self, SettingFieldKind, SourcedFieldValue};
use crate::plugins::{CallOutcome, PluginHost};

/// What a chain handed back, as the three facts a reader cares about.
fn answered(fields: &[SourcedFieldValue]) -> Vec<(String, String, String)> {
    fields
        .iter()
        .map(|field| {
            (
                field.key.clone(),
                field.value.clone(),
                field.source_plugin.clone(),
            )
        })
        .collect()
}

/// One failing plugin behind a working one: the shape every test below starts
/// from, so that what is being read is what the failure did to the answer.
fn one_broken(breaking: Arc<FakeBody>) -> (PluginHost, Arc<crate::events::Recorded>) {
    let (host, told) = fixture::host();
    host.enable("broken", breaking);
    host.enable(
        "working",
        FakeBody::answering(fixture::fields(&[("cover", "/working.jpg")])),
    );
    (host, told)
}

#[test]
fn a_plugin_that_throws_says_nothing_and_the_kernel_goes_on() {
    let (host, _) = one_broken(FakeBody::failing());

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/working.jpg".into(), "working".into())],
        "the plugin that failed is asked and skipped; the one after it is still asked"
    );
}

#[test]
fn the_notification_names_the_plugin_and_the_mount_point() {
    let (host, told) = one_broken(FakeBody::failing());

    host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        told.plugin_failures()
            .iter()
            .map(|failure| (
                failure.code.as_str(),
                failure.plugin.as_str(),
                failure.mount_point.as_str()
            ))
            .collect::<Vec<_>>(),
        vec![("plugin.call.failed", "broken", mount_points::VIDEO_FIELDS)],
        "one notification, and it says who and where"
    );
}

#[test]
fn a_plugin_that_ran_past_its_deadline_says_nothing() {
    let (host, told) = one_broken(FakeBody::timing_out());

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/working.jpg".into(), "working".into())]
    );
    assert_eq!(
        told.plugin_failures()
            .iter()
            .map(|failure| failure.code.as_str())
            .collect::<Vec<_>>(),
        vec!["plugin.call.timed_out"],
        "a call that was given up on for taking too long is not reported as one that broke"
    );
    assert_eq!(host.calls()[0].outcome, CallOutcome::TimedOut);
}

#[test]
fn the_host_has_no_deadline_of_its_own() {
    // The other half of the port's contract (`crate::plugins::runner`): a call
    // comes back because the port made it come back, so the host waits as long
    // as a body takes and hands back what it said. What this pins is that no
    // deadline has been put here — a timer of the host's own, or a thread per
    // call, is what ADR 0044 §2 rules out, and this is where either would show
    // up.
    let (host, _) = fixture::host();
    host.enable(
        "slow",
        FakeBody::slow(
            fixture::fields(&[("cover", "/slow.jpg")]),
            Duration::from_millis(30),
        ),
    );

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/slow.jpg".into(), "slow".into())],
        "a body that takes its time is waited for, not given up on"
    );
    assert!(
        host.calls()[0].elapsed >= Duration::from_millis(30),
        "the call took at least as long as the body did: {:?}",
        host.calls()[0].elapsed
    );
}

#[test]
fn an_answer_the_kernel_cannot_read_is_a_failure_too() {
    let (host, told) = one_broken(FakeBody::garbling());

    let fields = host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        answered(&fields),
        vec![("cover".into(), "/working.jpg".into(), "working".into())]
    );
    assert_eq!(told.plugin_failures().len(), 1);
    assert_eq!(host.calls()[0].outcome, CallOutcome::Failed);
}

#[test]
fn five_failed_calls_take_a_plugin_out_of_the_rotation() {
    let (host, told) = one_broken(FakeBody::failing());

    for _ in 0..4 {
        host.video_fields(&fixture::space(), &fixture::video());
    }
    assert_eq!(
        host.enabled(),
        vec!["broken", "working"],
        "four failures is not yet enough"
    );

    host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(host.enabled(), vec!["working"]);
    assert_eq!(told.plugin_failures().len(), 5);

    host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        told.plugin_failures().len(),
        5,
        "a plugin that has stopped being asked cannot keep filling the screen"
    );
    assert_eq!(
        host.calls().len(),
        11,
        "the fifth call was the last one made"
    );
}

#[test]
fn a_failure_at_one_mount_point_does_not_stop_the_other() {
    let (host, _) = fixture::host();
    host.enable(
        "picky",
        FakeBody::doing(|method, _| {
            if method == mount_points::VIDEO_FIELDS {
                Err(crate::plugins::RunnerError::Failed("no".to_string()))
            } else {
                Ok(fixture::settings(&[("url", SettingFieldKind::Text)]))
            }
        }),
    );

    assert!(host
        .video_fields(&fixture::space(), &fixture::video())
        .is_empty());
    assert_eq!(
        host.plugin_settings(&fixture::space(), &[])
            .iter()
            .map(|group| group.plugin.as_str())
            .collect::<Vec<_>>(),
        vec!["picky"],
        "the plugin that cannot answer one mount point is still asked at the next"
    );
    assert_eq!(host.calls().len(), 2);
}

#[test]
fn the_user_switching_a_plugin_back_on_gives_it_a_clean_start() {
    let (host, told) = one_broken(FakeBody::failing());
    for _ in 0..5 {
        host.video_fields(&fixture::space(), &fixture::video());
    }
    assert_eq!(host.enabled(), vec!["working"]);

    host.enable("broken", FakeBody::failing());
    host.video_fields(&fixture::space(), &fixture::video());

    assert_eq!(
        host.enabled(),
        vec!["broken", "working"],
        "one failure after the user turned it back on is one failure, not the sixth"
    );
    assert_eq!(told.plugin_failures().len(), 6);
}

#[test]
fn a_mount_call_answers_even_when_every_plugin_fails() {
    let (host, _) = fixture::host();
    for id in ["one", "two", "three"] {
        host.enable(id, FakeBody::failing());
    }

    assert!(host
        .video_fields(&fixture::space(), &fixture::video())
        .is_empty());
    assert!(host.plugin_settings(&fixture::space(), &[]).is_empty());
    host.scan_completed(&fixture::space(), &[fixture::video()]);
    for id in ["one", "two", "three"] {
        host.video_action(id, &fixture::space(), &fixture::video());
    }

    assert_eq!(
        host.calls().len(),
        12,
        "four mount points, three plugins each, and every ask came back with an answer"
    );
    assert_eq!(
        host.enabled().len(),
        3,
        "four failures is not yet five, so none of them has been switched off"
    );
}

#[test]
fn nothing_is_asked_when_no_plugin_is_enabled() {
    let (host, told) = fixture::host();

    assert!(host
        .video_fields(&fixture::space(), &fixture::video())
        .is_empty());
    host.scan_completed(&fixture::space(), &[fixture::video()]);

    assert!(host.calls().is_empty());
    assert!(told.plugin_failures().is_empty());
}
