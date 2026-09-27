//! The media jobs a command can start, each holding the scan slot while it runs.
//!
//! They are here rather than in the command that starts them because this is
//! where they can be tested: everything they touch — the index, the media
//! tools, the slot, the events — arrives as an argument, and the one thing a
//! command owns is the `AppHandle` that decides *where* the index and the cache
//! live. The command acquires the slot before it hands the work to a blocking
//! thread, so a second request is refused straight away rather than after
//! waiting for a thread to become free.
//!
//! The slot is the first argument rather than something acquired here: a job
//! that began on its own could be started while another one is running, and the
//! whole point of the slot is that this cannot happen.
//!
//! **The slot is dropped before the closing events go out.** `ScanGuard::drop`
//! is what turns a job that ended without reaching `complete` into `failed` or
//! `cancelled`, so a status read before it lands reports the phase the job was
//! in rather than the one it ended in. Each job below therefore does its work
//! in a function that owns the guard, and reports only after that function has
//! returned.

use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::events::Events;
use crate::media::MediaProcessor;
use crate::model::VideoFile;
use crate::repository::{lock_shared, Repository};
use crate::scan::control::{ScanControl, ScanGuard, ScanStatus};
use crate::scan::job as scan_job;
use crate::scan::media_pass::{self, MediaOperations, Outcome, Step};
use crate::scan::refresh::refresh_video;

/// Scans the current space's saved directories and processes what is new or
/// changed.
///
/// The two events at the end go out whichever way the scan went: the interface
/// is told what the slot now holds and that the library may have moved, and a
/// scan that failed halfway still moved it.
pub(crate) fn rescan(
    guard: ScanGuard,
    space_id: i64,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    media: &MediaProcessor,
    events: &impl Events,
) -> Result<Vec<VideoFile>, AppError> {
    let result = scanning(guard, space_id, repository, control, media, events);
    events.scan_progress(control.status());
    events.library_changed();
    result
}

fn scanning(
    guard: ScanGuard,
    space_id: i64,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    media: &MediaProcessor,
    events: &impl Events,
) -> Result<Vec<VideoFile>, AppError> {
    let _slot = guard;
    // No command starts a background scan: every scan is user-initiated.
    scan_job::run(media, space_id, repository, control, false, events)
}

/// Regenerates thumbnails for one video, or for every video in the space.
///
/// One video is an explicit request about a file the person is looking at, so a
/// media failure is the answer to it; a whole pass is a background sweep, where
/// one unreadable file must not take the rest of the work down with it and is
/// counted as a failure instead. That difference in what a failure means is all
/// the two shapes do not share, and it is the whole of what this job says about
/// them — the walk itself is [`media_pass::run`], the same one a scan makes.
pub(crate) fn regenerate_thumbnails(
    guard: ScanGuard,
    space_id: i64,
    path: Option<String>,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    media: &MediaProcessor,
    events: &impl Events,
) -> Result<(), AppError> {
    let result = regenerating(
        guard,
        space_id,
        path.as_deref(),
        repository,
        control,
        media,
        events,
    );
    events.scan_progress(control.status());
    events.library_changed();
    result
}

fn regenerating(
    guard: ScanGuard,
    space_id: i64,
    path: Option<&str>,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    media: &MediaProcessor,
    events: &impl Events,
) -> Result<(), AppError> {
    let _slot = guard;
    let videos: Vec<VideoFile> = lock_shared(repository)?
        .list(space_id)?
        .into_iter()
        .filter(|video| path.is_none_or(|path| video.path == path))
        .collect();
    let status = ScanStatus {
        discovered: videos.len(),
        indexed: videos.len(),
        // Every record already carries what the last pass read about it, so the
        // reading starts from what the library holds rather than from zero. Only
        // the frame is being made again.
        metadata_ready: videos.iter().filter(|video| video.width.is_some()).count(),
        ..Default::default()
    };
    media_pass::run(
        videos.iter(),
        status,
        "thumbnails",
        repository,
        control,
        events,
        &ThumbnailRegeneration {
            space_id,
            path,
            media,
        },
    )
}

/// What a regeneration does to a file: make the frame again, whether or not one
/// is already there — that is the point of asking for it.
struct ThumbnailRegeneration<'a> {
    space_id: i64,
    /// The one file that was asked for, if this is a request about a single file
    /// rather than a sweep over the space.
    path: Option<&'a str>,
    media: &'a MediaProcessor,
}

impl MediaOperations for ThumbnailRegeneration<'_> {
    fn steps(&self) -> &'static [Step] {
        &[Step::Thumbnail]
    }

    fn run(
        &self,
        _step: Step,
        video: &VideoFile,
        repository: &Arc<Mutex<Repository>>,
        control: &ScanControl,
    ) -> Result<Outcome, AppError> {
        let outcome = media_pass::produce(
            repository,
            || {
                self.media
                    .thumbnail(Path::new(&video.path), video.id, video.modified_at, || {
                        control.is_cancelled()
                    })
            },
            |index, produced| {
                index.save_thumbnail(self.space_id, video, &produced.to_string_lossy())
            },
        )?;
        match outcome {
            // A single file was asked for by name, so failing on it is the answer
            // to that request rather than a number in a sweep.
            Outcome::Failed(error) if self.path.is_some() => Err(error),
            outcome => Ok(outcome),
        }
    }
}

/// Re-reads one file's metadata, writing it only if the record still stands.
pub(crate) fn refresh_info(
    guard: ScanGuard,
    space_id: i64,
    path: &str,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    media: &MediaProcessor,
    events: &impl Events,
) -> Result<(), AppError> {
    let _slot = guard;
    let wrote = refresh_video(space_id, path, repository, control, |file| {
        media.probe(file, || control.is_cancelled())
    })?;
    if wrote {
        events.library_changed();
    }
    Ok(())
}
