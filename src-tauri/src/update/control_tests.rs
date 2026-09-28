use std::sync::Arc;

use super::control::{Stop, UpdateControl};
use super::fixture::stand_in;
use crate::scan::control::ScanControl;

/// Any address at all: nothing in this file fetches anything.
const ADDRESS: &str = "http://127.0.0.1:1/installer";

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

#[test]
fn a_ready_install_hands_over_the_release_and_closes_the_slot_behind_it() {
    // What a comment here used to say no test could reach. A successful install
    // needs bytes *and* the release they belong to, and the release was a
    // `tauri_plugin_updater::Update` — private fields, and nothing outside the
    // plugin can build one — so the last step of this rule was the one step no
    // test held. With a release a test can build it is the ordinary case.
    let control = UpdateControl::default();
    let scan = Arc::new(ScanControl::default());
    let release = stand_in("0.2.0", ADDRESS, "signature");
    control.remember(release.clone());
    control.take_slot(true).unwrap().install(vec![1, 2, 3]);

    let (handed_over, bytes) = control.install(&scan, true).unwrap();
    assert_eq!(handed_over.version(), "0.2.0");
    assert_eq!(bytes, vec![1, 2, 3]);
    assert_eq!(
        release.installed(),
        None,
        "the handover is the caller's to make"
    );
    // Both halves are spent, and the scan slot is closed rather than merely
    // free: installing exits the process, so there is no later to scan in.
    assert_eq!(control.ready_version(), None);
    assert_eq!(
        control.install(&scan, true).err().unwrap().code,
        "update.not_downloaded"
    );
    assert!(scan.begin().is_err());
}

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
fn a_different_offer_throws_away_what_was_already_downloaded() {
    // The rule that had no test until a release could be built, and the one
    // place in the application that throws away bytes the user has waited for.
    // The version is what decides it: an installer downloaded for one release
    // answers nothing once another is offered, and neither does half of one.
    //
    // What it prevents is not a wrong install — the signature would catch that —
    // but a payload assembled from two releases, which is discovered after the
    // user has waited for the whole transfer a second time.
    let control = UpdateControl::default();
    control.remember(stand_in("0.2.0", ADDRESS, "signature"));
    control.take_slot(true).unwrap().install(vec![1, 2, 3]);
    assert_eq!(control.ready_version().as_deref(), Some("0.2.0"));

    control.remember(stand_in("0.2.1", ADDRESS, "signature"));
    assert_eq!(control.ready_version(), None, "the installer is dropped");
    let next = control.take_slot(true).unwrap();
    assert!(
        next.resume().is_empty(),
        "and so is whatever a pause had kept"
    );
    next.discard();
    assert_eq!(
        control.pending().unwrap().version(),
        "0.2.1",
        "and the offer is the new one"
    );
}

#[test]
fn the_same_offer_keeps_what_was_already_downloaded() {
    // The other half, and the one the user feels: checking for updates again
    // while the same version is on offer must not throw away a download that is
    // already in hand. Without this, a second press of "check" would silently
    // restart a transfer the user had already sat through.
    let control = UpdateControl::default();
    control.remember(stand_in("0.2.0", ADDRESS, "signature"));
    control.take_slot(true).unwrap().keep(vec![4, 5, 6]);
    control.remember(stand_in("0.2.0", ADDRESS, "signature"));

    let next = control.take_slot(true).unwrap();
    assert_eq!(next.resume(), &[4, 5, 6]);
    next.discard();
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
