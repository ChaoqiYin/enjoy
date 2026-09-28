//! One download: from the user pressing download to whichever of the three
//! endings it reaches.

use serde::Serialize;

use crate::error::AppError;
use crate::events::Events;

use super::control::UpdateControl;
use super::download::{self, Asked, Transfer};
use super::verify;

/// What the settings section is told while a download runs, and what it is left
/// with when one ends.
///
/// One shape for the numbers and for the outcome, so the section reads a single
/// value either way. `phase` is `downloading` while it runs, and one of
/// `ready`, `paused`, `cancelled` when it stops.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub version: String,
}

/// Decides which progress updates are worth sending to the webview.
///
/// A fast download fires hundreds of chunk callbacks; one event each would
/// flood the frontend over a difference nobody can see. It sits beside the one
/// place that sends them, because the step it keeps is a fact about that
/// sending and nothing else.
#[derive(Default)]
pub struct ProgressThrottle {
    reported: bool,
    last_step: u64,
}

/// Step used when the server does not report a content length.
const UNKNOWN_TOTAL_STEP: u64 = 1 << 20;

impl ProgressThrottle {
    pub fn should_emit(&mut self, downloaded: u64, total: Option<u64>) -> bool {
        let step = match total.filter(|total| *total > 0) {
            Some(total) => (downloaded.saturating_mul(100) / total).min(100),
            None => downloaded / UNKNOWN_TOTAL_STEP,
        };
        if self.reported && step == self.last_step {
            return false;
        }
        self.reported = true;
        self.last_step = step;
        true
    }
}

/// Downloads and verifies the offered release, continuing one that was paused.
///
/// This is the whole of what pressing download does. It is a module's job rather
/// than a command's because the steps have an order between them and that order
/// is the interface: a reader asking what happens after the button is pressed
/// should find all of it in one place, and a test should be able to walk it
/// without a window.
///
/// The order, and why each step is where it is:
///
/// 1. The offer is taken, so what follows is the release the user accepted.
/// 2. The client is built. **Before** the slot is taken, because taking it
///    consumes the bytes a paused download kept: a machine that cannot build a
///    client would otherwise eat them on its way out.
/// 3. The slot is taken, which also frees the transfer to be stopped and hands
///    over those bytes.
/// 4. The transfer runs, reporting progress through [`Events`] as it goes.
/// 5. The signature is checked. Verified bytes are held for the restart; bytes
///    that failed are dropped, because half a release that is not what was
///    signed is no head start on the next attempt.
/// 6. The ending is reported. Pausing and a dropped connection both keep what
///    arrived; a cancel drops it.
///
/// The key is the caller's, read before this is entered: a configuration that
/// cannot name one is not a reason to spend half an hour transferring bytes
/// nobody can accept.
///
/// `supported` is a parameter rather than a call to [`is_supported`], for the
/// same reason [`UpdateControl::take_slot`] takes it: updates are published for
/// Windows only, and on any other machine the gate above would refuse every
/// transfer — including the ones a test wants to walk through.
///
/// Progress goes out as events and the ending is this call's answer. That split
/// is deliberate: the events carry the numbers because they arrive while nothing
/// can be answered, and the ending is answered because the section has to settle
/// on exactly one of "ready", "paused" or "cancelled", which is not a race it
/// should have to win.
///
/// [`is_supported`]: super::control::is_supported
pub(super) async fn run(
    control: &UpdateControl,
    pubkey: &str,
    user_agent: &str,
    supported: bool,
    events: &impl Events,
) -> Result<UpdateProgress, AppError> {
    let release = control.pending()?;
    let client = download::client(user_agent)
        .map_err(|error| AppError::new("update.download_failed", error))?;
    let slot = control.take_slot(supported)?;

    let version = release.version().to_string();
    let mut throttle = ProgressThrottle::default();
    let transfer = download::fetch(
        &client,
        release.download_url(),
        slot.resume(),
        control.flag(),
        |downloaded, total| {
            if throttle.should_emit(downloaded, total) {
                events.update_progress(UpdateProgress {
                    phase: "downloading".into(),
                    downloaded,
                    total,
                    version: version.clone(),
                });
            }
        },
    )
    .await;

    match transfer {
        Transfer::Complete(bytes) => {
            if let Err(reason) = verify::verify(&bytes, release.signature(), pubkey) {
                slot.discard();
                // Its own code, not the download's: the bytes arrived and are
                // not the ones that were signed, which is a different answer to
                // give the user than a connection that never finished.
                return Err(AppError::new("update.verify_failed", reason));
            }
            slot.install(bytes);
            Ok(ended("ready", 0, None, version))
        }
        Transfer::Stopped {
            asked,
            bytes,
            total,
        } => match asked {
            // Kept, so pressing download again asks for the rest rather than
            // fetching the whole release over — which on the link this exists
            // for is the difference between finishing and never finishing.
            Asked::Pause => {
                let downloaded = bytes.len() as u64;
                slot.keep(bytes);
                Ok(ended("paused", downloaded, total, version))
            }
            Asked::Cancel => {
                slot.discard();
                Ok(ended("cancelled", 0, None, version))
            }
        },
        Transfer::Failed { error, bytes } => {
            // Kept rather than dropped, so pressing download again carries on
            // from here. A failure on this link is expected rather than
            // exceptional, and starting from nothing each time is what would
            // make a release of this size unreachable.
            slot.keep(bytes);
            Err(AppError::new("update.download_failed", error))
        }
    }
}

/// The ending, in the shape the progress events already carry, so the section
/// reads one type for the numbers and for the outcome.
fn ended(phase: &str, downloaded: u64, total: Option<u64>, version: String) -> UpdateProgress {
    UpdateProgress {
        phase: phase.into(),
        downloaded,
        total,
        version,
    }
}
