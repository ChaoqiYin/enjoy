use super::control::{
    download_gate, install_gate, is_same_offer, published_at, ProgressThrottle, Stop, UpdateControl,
};
use crate::error::AppError;
use time::{Duration, OffsetDateTime};

fn code(result: Result<(), AppError>) -> String {
    result.unwrap_err().code
}

#[test]
fn a_published_date_is_written_as_rfc3339() {
    // `OffsetDateTime`'s own rendering is not a date JavaScript reads, and the
    // settings page formats this string while rendering: sending the rendering
    // would leave the frontend with an invalid date, which throws and takes the
    // whole window down with it.
    let date = OffsetDateTime::from_unix_timestamp(1_756_000_000).unwrap();
    assert_eq!(
        published_at(Some(date)).as_deref(),
        Some("2025-08-24T01:46:40Z")
    );
}

#[test]
fn a_published_date_keeps_the_manifest_fraction() {
    // The manifest the plugin reads carries milliseconds rather than whole
    // seconds — a real one reads `2026-09-26T15:47:36.624Z` — so the instant
    // handed to this function is almost never whole. The fraction has to
    // survive the round trip as a fraction, not as something JavaScript reads
    // as a different instant or refuses outright.
    let date =
        OffsetDateTime::from_unix_timestamp(1_756_000_000).unwrap() + Duration::milliseconds(624);
    assert_eq!(
        published_at(Some(date)).as_deref(),
        Some("2025-08-24T01:46:40.624Z")
    );
}

#[test]
fn a_release_without_a_date_sends_none() {
    assert_eq!(published_at(None), None);
}

#[test]
fn install_reports_the_platform_before_anything_else() {
    // Unsupported wins even when a scan is running and nothing was downloaded:
    // the platform is what decides whether this feature exists at all.
    assert_eq!(code(install_gate(false, true, false)), "update.unsupported");
}

#[test]
fn install_refuses_while_a_scan_is_running() {
    // Installing exits the process, which would lose the running pass.
    assert_eq!(
        code(install_gate(true, true, true)),
        "update.blocked.scanning"
    );
}

#[test]
fn install_refuses_before_a_download() {
    assert_eq!(
        code(install_gate(true, false, false)),
        "update.not_downloaded"
    );
}

#[test]
fn install_allows_a_ready_download() {
    assert!(install_gate(true, false, true).is_ok());
}

#[test]
fn download_refuses_on_an_unsupported_platform() {
    assert_eq!(code(download_gate(false, false)), "update.unsupported");
}

#[test]
fn download_refuses_a_second_download() {
    assert_eq!(code(download_gate(true, true)), "update.busy");
}

#[test]
fn download_allows_a_first_download() {
    assert!(download_gate(true, false).is_ok());
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

#[test]
fn same_offer_only_matches_the_same_version() {
    assert!(is_same_offer(Some("0.2.0"), "0.2.0"));
    assert!(!is_same_offer(Some("0.2.0"), "0.2.1"));
    assert!(!is_same_offer(None, "0.2.0"));
}

#[test]
fn control_reports_nothing_downloaded_before_a_download() {
    let control = UpdateControl::default();
    assert_eq!(
        control.pending().err().unwrap().code,
        "update.not_downloaded"
    );
    assert_eq!(
        control.take_installer().err().unwrap().code,
        "update.not_downloaded"
    );
    assert_eq!(control.ready_version(), None);
    assert!(!control.is_downloading());
}

#[test]
fn control_refuses_a_second_download_until_the_first_ends() {
    let control = UpdateControl::default();
    assert!(control.begin_download().is_ok());
    assert!(control.is_downloading());
    assert_eq!(control.begin_download().unwrap_err().code, "update.busy");
    control.end_download();
    assert!(!control.is_downloading());
    assert!(control.begin_download().is_ok());
}

#[test]
fn a_paused_download_hands_its_bytes_to_the_next_one() {
    let control = UpdateControl::default();
    control.begin_download().unwrap();
    control.park_partial(vec![1, 2, 3]);
    control.end_download();

    // Continuing takes them rather than copying them: they belong to one
    // transfer at a time, and a second taking would ask the server for bytes
    // the same transfer is already holding.
    assert_eq!(control.take_partial(), vec![1, 2, 3]);
    assert_eq!(control.take_partial(), Vec::<u8>::new());
}

#[test]
fn a_cancel_leaves_nothing_to_continue_from() {
    // The transfer hands its bytes back either way; dropping them is the
    // caller's decision, and this is the value it decides on. What is asserted
    // here is the other half: once dropped, the next download starts over.
    let control = UpdateControl::default();
    control.park_partial(vec![1, 2, 3]);
    control.park_partial(Vec::new());
    assert_eq!(control.take_partial(), Vec::<u8>::new());
}

#[test]
fn a_cancel_with_nothing_running_is_what_dismisses_a_pause() {
    let control = UpdateControl::default();
    control.park_partial(vec![1, 2, 3]);
    control.action("cancel").unwrap();
    assert_eq!(control.take_partial(), Vec::<u8>::new());
}

#[test]
fn a_pause_with_nothing_running_leaves_the_kept_bytes_alone() {
    // Nothing is running to pause, so the download is already in the state the
    // user asked for; throwing the bytes away would turn a pause into a cancel.
    let control = UpdateControl::default();
    control.park_partial(vec![1, 2, 3]);
    control.action("pause").unwrap();
    assert_eq!(control.take_partial(), vec![1, 2, 3]);
}

#[test]
fn an_unknown_action_is_refused() {
    // Including "resume": continuing is a download started again, not an action
    // on one. A name that is neither is a failure rather than a button that
    // quietly does nothing.
    let control = UpdateControl::default();
    assert_eq!(
        control.action("resume").unwrap_err().code,
        "update.invalid_action"
    );
    assert_eq!(
        control.action("").unwrap_err().code,
        "update.invalid_action"
    );
}

#[test]
fn an_ask_only_reaches_a_download_that_is_running() {
    // A pause pressed a moment after the transfer ended would otherwise be
    // waiting for the next one, stopping it the moment it opened a connection.
    let control = UpdateControl::default();
    control.action("pause").unwrap();
    assert_eq!(control.flag().requested(), Stop::Run);

    control.begin_download().unwrap();
    control.action("pause").unwrap();
    assert_eq!(control.flag().requested(), Stop::Pause);
    control.action("cancel").unwrap();
    assert_eq!(control.flag().requested(), Stop::Cancel);

    // And the download that follows the request forgets it, so it is not
    // stopped by an ask meant for the transfer before it.
    control.end_download();
    control.clear_stop();
    assert_eq!(control.flag().requested(), Stop::Run);
}

#[test]
fn control_has_nothing_ready_while_a_download_is_only_running() {
    // `begin_download` alone must not make the installer available: the bytes
    // are unverified until `download` returns.
    let control = UpdateControl::default();
    control.begin_download().unwrap();
    assert_eq!(control.ready_version(), None);
    assert_eq!(
        control.take_installer().err().unwrap().code,
        "update.not_downloaded"
    );
}

#[test]
fn control_reports_no_ready_version_without_an_offered_release() {
    // Downloaded bytes are only installable together with the release they
    // belong to, so a finished download alone does not make one ready.
    let control = UpdateControl::default();
    control.begin_download().unwrap();
    control.finish_download(vec![1, 2, 3]);
    assert!(!control.is_downloading());
    assert_eq!(control.ready_version(), None);
    assert_eq!(
        control.take_installer().err().unwrap().code,
        "update.not_downloaded"
    );
}
