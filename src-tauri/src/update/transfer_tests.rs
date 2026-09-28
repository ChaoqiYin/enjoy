use std::time::Duration;

use super::control::UpdateControl;
use super::fixture::{body, key, public_key_field, serve, serve_slowly, signature_field, stand_in};
use super::transfer::{run, ProgressThrottle};
use crate::events::Recorded;
use crate::scan::control::ScanControl;

/// What the command hands the transfer for a user agent. Nothing reads it.
const AGENT: &str = "Enjoy test";

fn download(
    control: &UpdateControl,
    pubkey: &str,
    events: &Recorded,
) -> Result<super::transfer::UpdateProgress, crate::error::AppError> {
    tauri::async_runtime::block_on(run(control, pubkey, AGENT, true, events))
}

#[test]
fn a_download_nobody_offered_is_refused_before_a_byte_is_fetched() {
    let control = UpdateControl::default();
    let events = Recorded::default();
    let error = download(&control, "any key", &events)
        .err()
        .expect("nothing is offered, so this cannot be a download");

    assert_eq!(error.code, "update.not_downloaded");
    assert!(
        events.updates().is_empty(),
        "and the interface is told nothing, because nothing was asked of it"
    );
}

#[test]
fn a_signed_release_downloads_reports_where_it_got_to_and_is_ready() {
    // The whole of what the download button does, walked on the loopback: the
    // offer is remembered, the bytes arrive, the signature is checked against
    // the key, and the result is ready for the restart.
    let payload = body(200_000);
    let signing = key(1);
    let server = serve(payload.clone());
    let control = UpdateControl::default();
    let release = stand_in(
        "0.2.0",
        &server.address,
        &signature_field(&signing, &payload),
    );
    control.remember(release.clone());
    let events = Recorded::default();

    let ended = download(&control, &public_key_field(&signing), &events).unwrap();

    assert_eq!(ended.phase, "ready");
    assert_eq!(ended.version, "0.2.0");

    // The interface was told how far the download had got: this is what the
    // settings page's bar is drawn from, and until now nothing could say whether
    // it was ever told anything at all.
    let reported = events.updates();
    assert!(
        reported.len() > 1,
        "a bar is told as the bytes move, not once: {} reports",
        reported.len()
    );
    assert!(
        reported
            .iter()
            .all(|progress| progress.phase == "downloading"),
        "and every one of them is progress while it runs"
    );
    assert_eq!(
        reported.iter().map(|progress| progress.downloaded).max(),
        Some(payload.len() as u64),
        "the numbers reach the end of the payload"
    );
    assert!(
        reported
            .iter()
            .all(|progress| progress.total == Some(payload.len() as u64)),
        "and each of them carries the announced length, so the bar can say how far"
    );
    assert!(
        reported.iter().all(|progress| progress.version == "0.2.0"),
        "and names the release it belongs to, which is what the section matches on"
    );

    // Ready means both halves held: the release and the bytes, handed over
    // together or not at all.
    assert_eq!(control.ready_version().as_deref(), Some("0.2.0"));
    let (handed_over, bytes) = control.install(&ScanControl::default(), true).unwrap();
    assert_eq!(handed_over.version(), "0.2.0");
    assert_eq!(bytes, payload, "the bytes held are the payload itself");
}

#[test]
fn a_pause_while_bytes_are_arriving_ends_as_paused_and_keeps_them() {
    // A pause is pressed while the transfer is running, which is when the
    // button is there to be pressed. The payload is sent in small pieces over
    // long enough that the press always lands in the middle of it — before the
    // first byte is the one shape this must not be, because a pause that
    // arrives first is a different case entirely.
    let payload = body(1_000_000);
    let signing = key(1);
    let server = serve_slowly(payload.clone(), 8_192, Duration::from_millis(5));
    let control = UpdateControl::default();
    control.remember(stand_in(
        "0.2.0",
        &server.address,
        &signature_field(&signing, &payload),
    ));
    let events = Recorded::default();

    let ended = std::thread::scope(|scope| {
        scope.spawn(|| {
            std::thread::sleep(Duration::from_millis(300));
            control
                .action("pause")
                .expect("a pause is an action it knows");
        });
        download(&control, &public_key_field(&signing), &events).unwrap()
    });

    assert_eq!(ended.phase, "paused");
    assert!(
        ended.downloaded > 0 && ended.downloaded < payload.len() as u64,
        "the press landed in the middle of the transfer, at {} of {}",
        ended.downloaded,
        payload.len()
    );
    // The bar was told where the transfer had got to, and never claimed to be
    // further along than the bytes actually reached — which is what a progress
    // bar must not do, since the section leaves it drawn where it stands.
    let reported: Vec<u64> = events
        .updates()
        .iter()
        .map(|progress| progress.downloaded)
        .collect();
    assert!(!reported.is_empty(), "the bar was told something");
    assert!(
        reported.windows(2).all(|pair| pair[0] <= pair[1]),
        "and told it in order: {reported:?}"
    );
    assert!(
        reported.last().copied().unwrap_or(0) <= ended.downloaded,
        "the bar never ran ahead of the bytes"
    );

    // What was kept is exactly what the bar last said, so the next press of
    // download asks the server for the rest rather than for the whole release.
    let next = control.take_slot(true).unwrap();
    assert_eq!(next.resume().len() as u64, ended.downloaded);
    assert_eq!(next.resume(), &payload[..ended.downloaded as usize]);
    next.discard();
}

#[test]
fn a_payload_that_is_not_the_signed_one_is_refused_and_nothing_is_kept() {
    // The bytes arrive whole and are not the ones that were signed — a
    // substituted payload, or a transfer that was tampered with. Its own code,
    // not the download's: the connection finished, and what arrived is wrong.
    let served = body(200_000);
    let signing = key(1);
    let server = serve(served);
    let control = UpdateControl::default();
    // Signed over something else, so the signature is well formed and does not
    // answer for these bytes.
    control.remember(stand_in(
        "0.2.0",
        &server.address,
        &signature_field(&signing, &body(100)),
    ));
    let events = Recorded::default();

    let error = download(&control, &public_key_field(&signing), &events)
        .err()
        .expect("the payload is not the signed one");

    assert_eq!(error.code, "update.verify_failed");
    assert_eq!(control.ready_version(), None);
    // Half a release that failed its signature is not a head start on the next
    // attempt, so nothing is kept to continue from.
    let next = control.take_slot(true).unwrap();
    assert!(next.resume().is_empty());
    next.discard();
}

#[test]
fn throttle_reports_the_first_chunk() {
    let mut throttle = ProgressThrottle::default();
    assert!(throttle.should_emit(0, Some(1_000)));
}

#[test]
fn throttle_only_reports_a_new_whole_percent() {
    let mut throttle = ProgressThrottle::default();
    assert!(throttle.should_emit(0, Some(1_000)));
    assert!(!throttle.should_emit(5, Some(1_000)));
    assert!(throttle.should_emit(15, Some(1_000)));
    assert!(!throttle.should_emit(19, Some(1_000)));
}

#[test]
fn throttle_falls_back_to_a_mebibyte_step() {
    let mut throttle = ProgressThrottle::default();
    assert!(throttle.should_emit(0, None));
    assert!(!throttle.should_emit(1 << 19, None));
    assert!(throttle.should_emit(1 << 20, None));
}

#[test]
fn throttle_treats_a_zero_total_as_unknown() {
    // A server answering `Content-Length: 0` must not divide by zero.
    let mut throttle = ProgressThrottle::default();
    assert!(throttle.should_emit(0, Some(0)));
    assert!(!throttle.should_emit(1 << 19, Some(0)));
    assert!(throttle.should_emit(1 << 20, Some(0)));
}

#[test]
fn throttle_clamps_a_server_that_over_reports_progress() {
    let mut throttle = ProgressThrottle::default();
    assert!(throttle.should_emit(0, Some(100)));
    // Past the reported total the step must stay at 100, otherwise every
    // further chunk would count as a new step and emit again.
    assert!(throttle.should_emit(200, Some(100)));
    assert!(!throttle.should_emit(500, Some(100)));
}
