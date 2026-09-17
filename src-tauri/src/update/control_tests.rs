use super::control::{
    download_gate, install_gate, is_same_offer, DownloadTracker, ProgressThrottle, UpdateControl,
};
use crate::error::AppError;

fn code(result: Result<(), AppError>) -> String {
    result.unwrap_err().code
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
fn tracker_adds_chunk_lengths_instead_of_replacing() {
    // The callback reports the size of one chunk, not a running total. Reading
    // it as a total would freeze the bar at the size of the last chunk.
    let mut tracker = DownloadTracker::default();
    assert_eq!(tracker.record(100, Some(1_000)), 100);
    assert_eq!(tracker.record(250, Some(1_000)), 350);
}

#[test]
fn tracker_keeps_the_first_total_and_ignores_later_ones() {
    let mut tracker = DownloadTracker::default();
    tracker.record(10, Some(1_000));
    tracker.record(10, None);
    assert_eq!(tracker.total(), Some(1_000));
}

#[test]
fn tracker_survives_a_chunk_larger_than_its_counter() {
    let mut tracker = DownloadTracker::default();
    assert_eq!(tracker.record(usize::MAX, None), usize::MAX as u64);
    assert_eq!(tracker.record(usize::MAX, None), u64::MAX);
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
    control.fail_download();
    assert!(!control.is_downloading());
    assert!(control.begin_download().is_ok());
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
