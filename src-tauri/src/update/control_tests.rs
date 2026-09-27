use super::control::{is_same_offer, published_at, ProgressThrottle, Stop, UpdateControl};
use crate::scan::control::ScanControl;
use std::sync::Arc;
use time::{Duration, OffsetDateTime};

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
    let scan = Arc::new(ScanControl::default());
    let running = scan.begin().unwrap();
    assert_eq!(
        UpdateControl::default()
            .install(&scan, false)
            .err()
            .unwrap()
            .code,
        "update.unsupported"
    );
    // A refusal spends nothing — least of all the one irreversible step. The
    // slot is still takable once the scan it was refused for has ended.
    drop(running);
    assert!(scan.begin().is_ok());
}

#[test]
fn install_refuses_while_a_scan_is_running() {
    // Installing exits the process, which would lose the running pass. The
    // running scan is also reported above the missing download, which is the
    // order the interface has always shown: this control has nothing downloaded
    // either, and `update.blocked.scanning` is the answer.
    let scan = Arc::new(ScanControl::default());
    let running = scan.begin().unwrap();
    assert_eq!(
        UpdateControl::default()
            .install(&scan, true)
            .err()
            .unwrap()
            .code,
        "update.blocked.scanning"
    );
    // The refusal did not close the slot. Closing is for good, so a refusal that
    // spent it would leave the application unable to scan at all.
    drop(running);
    assert!(scan.begin().is_ok());
}

#[test]
fn install_refuses_before_a_download() {
    let scan = Arc::new(ScanControl::default());
    assert_eq!(
        UpdateControl::default()
            .install(&scan, true)
            .err()
            .unwrap()
            .code,
        "update.not_downloaded"
    );
    // Same as the refusal above: nothing was spent.
    assert!(scan.begin().is_ok());
}

// What no test here reaches: `install` succeeding, and the slot being closed
// behind it. A successful install needs a `ready` control — bytes *and* the
// release they belong to — and the release is a `tauri_plugin_updater::Update`,
// whose fields are private and which nothing outside the plugin can build. So
// the closing call itself is the one step of this rule no test holds; the slot's
// own half of it is tested where the slot lives, and the refusals are above.

#[test]
fn taking_the_slot_refuses_on_an_unsupported_platform() {
    let control = UpdateControl::default();
    // Not through `code`, which speaks for the gate: a refusal from the slot
    // carries a `Slot` on the other arm, and a `Slot` has no `Debug` to unwrap
    // past.
    assert_eq!(
        control.take_slot(false).err().unwrap().code,
        "update.unsupported"
    );
}

#[test]
fn taking_the_slot_refuses_a_second_download_until_the_first_ends() {
    // The gate is asked under the slot's own lock, so a second transfer cannot
    // slip in between the question and the taking.
    let control = UpdateControl::default();
    let first = control.take_slot(true).unwrap();
    assert_eq!(control.take_slot(true).err().unwrap().code, "update.busy");
    first.discard();
    assert!(control.take_slot(true).is_ok());
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
        control
            .install(&ScanControl::default(), true)
            .err()
            .unwrap()
            .code,
        "update.not_downloaded"
    );
    assert_eq!(control.ready_version(), None);
    assert!(control.take_slot(true).is_ok());
}

#[test]
fn a_paused_download_hands_its_bytes_to_the_next_one() {
    let control = UpdateControl::default();
    control.take_slot(true).unwrap().keep(vec![1, 2, 3]);

    // Continuing takes them rather than copying them: they belong to one
    // transfer at a time, and a second taking would ask the server for bytes
    // the same transfer is already holding.
    let next = control.take_slot(true).unwrap();
    assert_eq!(next.resume(), &[1, 2, 3]);
    next.discard();
    // And the one after that starts from the beginning.
    assert!(control.take_slot(true).unwrap().resume().is_empty());
}

#[test]
fn every_ending_frees_the_slot_and_decides_the_bytes_at_once() {
    // These were two calls whose order a comment carried, and reversing them —
    // freeing the slot and then parking what arrived — dropped everything a
    // paused download had. Each ending consumes the slot now, so the two cannot
    // come apart: taking the slot again is both the proof that it was freed and
    // the way to see what became of the bytes.
    let control = UpdateControl::default();

    // Kept, as a pause and a dropped connection both are: the next transfer
    // takes up where this one left off rather than starting over.
    control.take_slot(true).unwrap().keep(vec![1, 2, 3]);
    let resumed = control.take_slot(true).unwrap();
    assert_eq!(resumed.resume(), &[1, 2, 3]);
    // Dropped, as a cancel is: freed in the same breath, with nothing left of
    // what was thrown away.
    resumed.discard();
    assert!(control.take_slot(true).unwrap().resume().is_empty());
}

#[test]
fn a_cancel_leaves_nothing_to_continue_from() {
    // The transfer hands its bytes back either way; dropping them is the
    // caller's decision, and this is the value it decides on. What is asserted
    // here is the other half: once dropped, the next download starts over.
    let control = UpdateControl::default();
    control.take_slot(true).unwrap().keep(vec![1, 2, 3]);
    control.take_slot(true).unwrap().discard();
    assert!(control.take_slot(true).unwrap().resume().is_empty());
}

#[test]
fn a_cancel_with_nothing_running_is_what_dismisses_a_pause() {
    let control = UpdateControl::default();
    control.take_slot(true).unwrap().keep(vec![1, 2, 3]);
    control.action("cancel").unwrap();
    assert!(control.take_slot(true).unwrap().resume().is_empty());
}

#[test]
fn a_pause_with_nothing_running_leaves_the_kept_bytes_alone() {
    // Nothing is running to pause, so the download is already in the state the
    // user asked for; throwing the bytes away would turn a pause into a cancel.
    let control = UpdateControl::default();
    control.take_slot(true).unwrap().keep(vec![1, 2, 3]);
    control.action("pause").unwrap();
    assert_eq!(control.take_slot(true).unwrap().resume(), &[1, 2, 3]);
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

    let slot = control.take_slot(true).unwrap();
    control.action("pause").unwrap();
    assert_eq!(control.flag().requested(), Stop::Pause);
    control.action("cancel").unwrap();
    assert_eq!(control.flag().requested(), Stop::Cancel);

    // And the download that follows the request forgets it — taking the slot is
    // what forgets it — so it is not stopped by an ask meant for the transfer
    // before it.
    slot.discard();
    let next = control.take_slot(true).unwrap();
    assert_eq!(control.flag().requested(), Stop::Run);
    next.discard();
}

#[test]
fn control_has_nothing_ready_while_a_download_is_only_running() {
    // Taking the slot must not make the installer available: the bytes are
    // unverified until the transfer ends and the signature is checked.
    let control = UpdateControl::default();
    let scan = ScanControl::default();
    let slot = control.take_slot(true).unwrap();
    assert_eq!(control.ready_version(), None);
    assert_eq!(
        control.install(&scan, true).err().unwrap().code,
        "update.not_downloaded"
    );
    slot.discard();
}

#[test]
fn control_reports_no_ready_version_without_an_offered_release() {
    // Downloaded bytes are only installable together with the release they
    // belong to, so a finished download alone does not make one ready.
    let control = UpdateControl::default();
    let scan = ScanControl::default();
    control.take_slot(true).unwrap().install(vec![1, 2, 3]);
    assert_eq!(control.ready_version(), None);
    assert_eq!(
        control.install(&scan, true).err().unwrap().code,
        "update.not_downloaded"
    );
}
