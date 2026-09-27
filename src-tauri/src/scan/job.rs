use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, SCAN_CANCELLED};
use crate::events::Events;
use crate::media::MediaProcessor;
use crate::model::VideoFile;
use crate::repository::{lock_shared, DirectoryScan, Repository};
use crate::scan::control::{ScanControl, ScanStatus};
use crate::scan::media_pass::{self, MediaOperations, Outcome, Step};
use crate::scan::scanner;

/// Runs one 增量扫描 of a space: bring the index in line with the scan universe,
/// then bring each record's media in line with its file.
///
/// The two halves report into one status, and the media half is a
/// [`media_pass::run`] — the same walk a thumbnail regeneration makes, told what
/// runs on a file and what a failure on it means.
pub fn run(
    media: &MediaProcessor,
    space_id: i64,
    repository: &Arc<Mutex<Repository>>,
    control: &ScanControl,
    events: &impl Events,
) -> Result<Vec<VideoFile>, AppError> {
    let mut progress = ScanStatus {
        phase: "discovering".into(),
        operation: "scan".into(),
        ..Default::default()
    };
    events.scan_progress(control.publish(progress.clone()));
    // The scan universe is read from the repository, not received from the
    // caller, so no caller can scan a subset and have the cleanup of the
    // directories it left out be decided by this run. The space, on the other
    // hand, is received: it is what the caller is acting on, and it is the one
    // thing this run cannot work out for itself.
    let directories = lock_shared(repository)?.directories(space_id)?;
    let mut scans = Vec::with_capacity(directories.len());
    for path in directories {
        control.checkpoint()?;
        progress.current_path = path.clone();
        events.scan_progress(control.publish(progress.clone()));
        // One question decides both how the directory is read and whether it
        // belongs to this run's range: is the path still there? A directory
        // that is gone is read as one whose videos all went with it, and its
        // records are cleared. One that is there but cannot be read says
        // nothing about its contents, so it is skipped whole and keeps them.
        // Only the second is a fact about the scan's range rather than about
        // the directory's contents, so only it is counted as unreachable.
        match std::fs::metadata(&path) {
            Err(_) => scans.push(DirectoryScan {
                path,
                files: Some(Vec::new()),
                unreadable: Vec::new(),
            }),
            Ok(metadata) if !metadata.is_dir() => {
                progress.unreachable_directories += 1;
                scans.push(DirectoryScan {
                    path,
                    files: None,
                    unreadable: Vec::new(),
                });
            }
            Ok(_) => {
                // The resolved path is what earlier scans indexed, so a
                // configured directory that is a symlink keeps matching its
                // own records. A path that cannot be resolved is walked as it
                // was written instead.
                let root = std::fs::canonicalize(&path)
                    .unwrap_or_else(|_| std::path::PathBuf::from(&path));
                match scanner::collect_controlled(
                    &root,
                    || control.checkpoint(),
                    |error| {
                        progress.failures += 1;
                        events.media_error(&error);
                    },
                ) {
                    Ok(collected) => scans.push(DirectoryScan {
                        path,
                        files: Some(collected.files),
                        unreadable: collected.unreadable,
                    }),
                    Err(error) if error.code == SCAN_CANCELLED => return Err(error),
                    // Reported through the dedicated count instead of an error
                    // notice: one unreadable directory must not stop the other
                    // directories from being cleaned up, and the notice is the
                    // place for that count.
                    Err(_) => {
                        progress.unreachable_directories += 1;
                        scans.push(DirectoryScan {
                            path,
                            files: None,
                            unreadable: Vec::new(),
                        });
                    }
                }
            }
        }
    }
    control.checkpoint()?;
    let videos = {
        let mut index = lock_shared(repository)?;
        progress.changes =
            index.replace_videos_controlled(space_id, &scans, || control.checkpoint())?;
        index.list(space_id)?
    };
    progress.current_path.clear();
    progress.discovered = videos.len();
    progress.indexed = videos.len();
    // Everything the library already had finished is counted as done before the
    // pass opens, so the reading starts where the library actually stands rather
    // than at zero — and those records are the ones the pass has nothing to do
    // for, which is what makes a rescan of an unchanged library touch no media
    // tool at all.
    let completed = videos.iter().filter(|video| video.media_complete).count();
    progress.processed = completed;
    progress.metadata_ready = completed;
    progress.thumbnails_ready = completed;
    media_pass::run(
        videos.iter().filter(|video| !video.media_complete),
        progress,
        "thumbnails",
        repository,
        control,
        events,
        &ScanMedia { space_id, media },
    )?;
    lock_shared(repository)?.list(space_id)
}

/// Whether the frame the record points at is still where it says it is.
///
/// A pass is handed every record that is not 媒体处理完成, and that set is not the
/// set of records needing work: one can have its facts read and the picture
/// still missing, or both stored and never marked done.
fn frame_missing(video: &VideoFile) -> bool {
    video
        .thumbnail_path
        .as_ref()
        .is_none_or(|path| !Path::new(path).exists())
}

/// What a scan does to a file: read what it is, and make the frame the library
/// shows for it — each written back as soon as it is produced.
struct ScanMedia<'a> {
    space_id: i64,
    media: &'a MediaProcessor,
}

impl MediaOperations for ScanMedia<'_> {
    fn steps(&self) -> &'static [Step] {
        &[Step::Metadata, Step::Thumbnail]
    }

    fn run(
        &self,
        step: Step,
        video: &VideoFile,
        repository: &Arc<Mutex<Repository>>,
        control: &ScanControl,
    ) -> Result<Outcome, AppError> {
        let path = Path::new(&video.path);
        match step {
            // Nothing to read: the facts are already in the index against this
            // file identity. The pass was handed the files that are not
            // finished, not the files that need work — those two are different
            // sets, and a file can be missing only its frame.
            Step::Metadata if video.width.is_some() => Ok(Outcome::Through),
            Step::Metadata => media_pass::produce(
                repository,
                || self.media.probe(path, || control.is_cancelled()),
                |index, metadata| index.save_metadata(self.space_id, video, &metadata),
            ),
            // Nothing to make: the frame is in the cache. It is looked for on
            // disk rather than trusted from the record, because a cache that was
            // emptied takes the picture with it and the record would not know.
            Step::Thumbnail if !frame_missing(video) => Ok(Outcome::Through),
            Step::Thumbnail => media_pass::produce(
                repository,
                || {
                    self.media
                        .thumbnail(path, video.id, video.modified_at, || control.is_cancelled())
                },
                |index, produced| {
                    index.save_thumbnail(self.space_id, video, &produced.to_string_lossy())
                },
            ),
        }
    }

    fn finish(
        &self,
        video: &VideoFile,
        metadata_ready: bool,
        repository: &Arc<Mutex<Repository>>,
    ) -> Result<(), AppError> {
        // 媒体处理完成 is a fact about the record, and it is the record that
        // decides it: the write below only takes effect when both the facts and
        // the frame are already stored against this file identity. So there is
        // nothing to work out here, and nothing to get wrong — a file whose
        // facts never arrived simply stays unfinished.
        if metadata_ready {
            lock_shared(repository)?.complete_media(self.space_id, video)?;
        }
        Ok(())
    }
}
