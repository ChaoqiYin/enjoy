//! The rhythm every media job shares: walk the files, work on each one, and say
//! so as it goes.
//!
//! A scan's media phase and a thumbnail regeneration walk their files the same
//! way — take a checkpoint, name the file being worked on, run the tools, count
//! what got through, report — and the two were written out separately, agreeing
//! line for line. Only two things actually differ, and both are what the caller
//! supplies: what runs on a file ([`MediaOperations`]), and what a failure means.
//!
//! The counting rule is the part worth having once. A file counts into a step's
//! counter only when that step got through, so a failure and a success cannot
//! cancel out. Both loops derived it by sampling the failure count before and
//! after each step and comparing the two — three chances to compare the wrong
//! pair of numbers. Here a step simply has no way to be counted as ready for a
//! failure: [`Outcome::Failed`] moves the failure count and nothing else.
//!
//! **The pass narrates the walk; the caller announces the ending.** A pass that
//! ends early leaves the phase where it stands, because `ScanGuard::drop` is
//! what turns a job that never reached `complete` into `failed` or `cancelled`,
//! and it runs when the caller drops the slot. The interface hears about the
//! outcome from the caller, after that — which is the only moment the verdict
//! exists.

use std::sync::{Arc, Mutex};

use crate::error::{AppError, SCAN_CANCELLED};
use crate::events::Events;
use crate::model::VideoFile;
use crate::repository::{lock_shared, Repository};
use crate::scan::control::{ScanControl, ScanStatus};

/// One thing a pass does to a file, in the order the interface hears about it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Step {
    /// Read the file's own facts — 媒体元数据 — and write them to the index.
    Metadata,
    /// Produce the frame the library shows for the file — 缩略图.
    Thumbnail,
}

/// What one step came to, before the pass decides what a failure means.
pub(crate) enum Outcome {
    /// The step got through — including a step that had nothing to do. A step
    /// with no work in it is a step that cannot fail, and the file counts as
    /// ready for it either way: the counters say how much of the library is
    /// ready, not how much of it this pass touched.
    Through,
    /// The tool could not do its job. It comes back here rather than as an `Err`
    /// because whether it ends the pass is the caller's call: for a sweep it is
    /// one more counted failure, and for a file asked for by name it is the
    /// answer to that request.
    Failed(AppError),
}

/// What a pass does to each file it reaches.
///
/// The pass owns the rhythm and the counting; an implementation owns the work —
/// which tools run, what is written back, and what a failure means.
pub(crate) trait MediaOperations {
    /// The steps this pass walks for every file, in the order the interface
    /// hears about them. A step a file has nothing left to do for is not left
    /// out of the walk: it is a step that cannot fail, and leaving it out would
    /// quietly change what its counter means.
    fn steps(&self) -> &'static [Step];

    /// Runs one step, writing what it produced back to the index.
    ///
    /// A tool that could not do its job is an [`Outcome::Failed`] for the caller
    /// to weigh; a cancellation, and a failure to write the result into the
    /// index, are the pass's own problem and come back as `Err`.
    fn run(
        &self,
        step: Step,
        video: &VideoFile,
        repository: &Arc<Mutex<Repository>>,
        control: &ScanControl,
    ) -> Result<Outcome, AppError>;

    /// Runs once per file after its steps, told whether the file's facts are in
    /// place. Nothing by default.
    fn finish(
        &self,
        _video: &VideoFile,
        _metadata_ready: bool,
        _repository: &Arc<Mutex<Repository>>,
    ) -> Result<(), AppError> {
        Ok(())
    }
}

/// Runs one media tool and writes what it produced back to the index.
///
/// The two kinds of failure are kept apart here, once, because getting them
/// wrong is silent: a tool that could not do its job leaves the file not ready
/// and the pass goes on, while a failure to *write* the result is the pass's own
/// problem and ends it. A cancellation is neither — it is the pass being asked
/// to stop — and it is recognised in one place rather than at each call.
///
/// The index is reached through the shared lock for the write rather than held
/// across the call: a media tool runs for seconds, and the interface reads the
/// library while it does.
pub(crate) fn produce<T>(
    repository: &Arc<Mutex<Repository>>,
    tool: impl FnOnce() -> Result<T, AppError>,
    save: impl FnOnce(&Repository, T) -> Result<(), AppError>,
) -> Result<Outcome, AppError> {
    let produced = match tool() {
        Ok(produced) => produced,
        Err(error) if error.code == SCAN_CANCELLED => return Err(error),
        Err(error) => return Ok(Outcome::Failed(error)),
    };
    let index = lock_shared(repository)?;
    save(&index, produced)?;
    Ok(Outcome::Through)
}

/// Walks `videos`, running the steps each file needs and reporting as it goes.
///
/// The status is finished here: the pass opens the `processing` phase, moves the
/// counters, and closes on `complete`. Which is why the caller hands over the
/// counts it knows — what was discovered, what the library already had finished
/// — and lets the pass carry them from there.
pub(crate) fn run<'a>(
    videos: impl IntoIterator<Item = &'a VideoFile>,
    mut status: ScanStatus,
    operation: &str,
    repository: &Arc<Mutex<Repository>>,
    control: &ScanControl,
    events: &impl Events,
    operations: &impl MediaOperations,
) -> Result<(), AppError> {
    status.phase = "processing".into();
    status.operation = operation.into();
    status.current_path.clear();
    announce(&status, control, events);

    for video in videos {
        control.checkpoint()?;
        status.current_path = video.path.clone();
        announce(&status, control, events);

        let mut metadata_ready = true;
        for step in operations.steps() {
            control.checkpoint()?;
            let outcome = operations.run(*step, video, repository, control)?;
            let ready = match &outcome {
                Outcome::Through => true,
                Outcome::Failed(error) => {
                    // Counted, told to the interface, and no more: the file goes
                    // on to its next step, and this counter does not move.
                    status.failures += 1;
                    events.media_error(error);
                    false
                }
            };
            if ready {
                match step {
                    Step::Metadata => status.metadata_ready += 1,
                    Step::Thumbnail => status.thumbnails_ready += 1,
                }
            }
            if *step == Step::Metadata {
                metadata_ready = ready;
            }
            announce(&status, control, events);
        }
        operations.finish(video, metadata_ready, repository)?;

        status.processed += 1;
        status.current_path.clear();
        announce(&status, control, events);
    }

    control.checkpoint()?;
    status.phase = "complete".into();
    // Published, not announced: the caller is the one that tells the interface
    // how a pass ended, and it does that once the slot is back — the only moment
    // at which a `failed` or `cancelled` verdict exists at all. Saying it here
    // as well would say it twice, and the second time is the one that counts.
    control.publish(status);
    Ok(())
}

/// Reports the status as it stands: into the slot, which is what a reader that
/// comes late gets, and out to the interface, which is what it draws.
///
/// One call, not two: `publish` hands back the status a reader would now see,
/// with the paused phase already over it, so there is nothing to read back and
/// no way to send out a different status than the slot holds.
fn announce(status: &ScanStatus, control: &ScanControl, events: &impl Events) {
    events.scan_progress(control.publish(status.clone()));
}
