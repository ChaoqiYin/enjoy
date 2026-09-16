use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::media::MediaProcessor;
use crate::model::VideoFile;
use crate::repository::{DirectoryScan, Repository};
use crate::scan::control::{ScanControl, ScanStatus};
use crate::scan::scanner;

pub fn run(
    media: &MediaProcessor,
    repository: &Arc<Mutex<Repository>>,
    control: &ScanControl,
    background: bool,
    mut on_progress: impl FnMut(ScanStatus),
    mut on_error: impl FnMut(AppError),
) -> Result<Vec<VideoFile>, AppError> {
    let mut progress = ScanStatus {
        phase: "discovering".into(),
        operation: "scan".into(),
        background,
        ..Default::default()
    };
    control.publish(progress.clone());
    on_progress(control.status());
    // The scan universe is read from the repository, not received from the
    // caller, so no caller can scan a subset and have the cleanup of the
    // directories it left out be decided by this run.
    let directories = {
        repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
            .directories()?
    };
    let mut scans = Vec::with_capacity(directories.len());
    for path in directories {
        control.checkpoint()?;
        progress.current_path = path.clone();
        control.publish(progress.clone());
        on_progress(control.status());
        let scanned = std::fs::canonicalize(&path)
            .map_err(|error| AppError::io(error, &path))
            .and_then(|root| {
                scanner::collect_controlled(
                    &root,
                    || control.checkpoint(),
                    |error| {
                        progress.failures += 1;
                        on_error(error);
                    },
                )
            });
        match scanned {
            Ok(files) => scans.push(DirectoryScan {
                path,
                files: Some(files),
            }),
            Err(error) if error.code == "media.scan.cancelled" => return Err(error),
            // Reported through the dedicated count instead of an error notice:
            // one unreadable directory must not stop the other directories from
            // being cleaned up, and the notice is the place for that count.
            Err(_) => {
                progress.unreachable_directories += 1;
                scans.push(DirectoryScan { path, files: None });
            }
        }
    }
    control.checkpoint()?;
    let videos = {
        let mut guard = repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?;
        progress.changes = guard.replace_videos_controlled(&scans, || control.checkpoint())?;
        guard.list()?
    };
    progress.phase = "processing".into();
    progress.operation = "thumbnails".into();
    progress.current_path.clear();
    progress.discovered = videos.len();
    progress.indexed = videos.len();
    let completed = videos.iter().filter(|video| video.media_complete).count();
    progress.processed = completed;
    progress.metadata_ready = completed;
    progress.thumbnails_ready = completed;
    control.publish(progress.clone());
    on_progress(control.status());
    for video in videos.iter().filter(|video| !video.media_complete) {
        control.checkpoint()?;
        progress.current_path = video.path.clone();
        control.publish(progress.clone());
        on_progress(control.status());
        let failures_before_metadata = progress.failures;
        if video.width.is_none() {
            match media.probe(std::path::Path::new(&video.path), || control.is_cancelled()) {
                Ok(metadata) => repository
                    .lock()
                    .map_err(|_| {
                        AppError::new("media.database.lock_failed", "Database lock poisoned")
                    })?
                    .save_metadata(video, &metadata)?,
                Err(error) => {
                    if error.code == "media.scan.cancelled" {
                        return Err(error);
                    }
                    progress.failures += 1;
                    on_error(error);
                }
            }
        }
        if progress.failures == failures_before_metadata {
            progress.metadata_ready += 1;
        }
        control.publish(progress.clone());
        on_progress(control.status());
        control.checkpoint()?;
        let failures_before_thumbnail = progress.failures;
        if video
            .thumbnail_path
            .as_ref()
            .is_none_or(|path| !std::path::Path::new(path).exists())
        {
            match media.thumbnail(
                std::path::Path::new(&video.path),
                video.id,
                video.modified_at,
                || control.is_cancelled(),
            ) {
                Ok(path) => repository
                    .lock()
                    .map_err(|_| {
                        AppError::new("media.database.lock_failed", "Database lock poisoned")
                    })?
                    .save_thumbnail(video, &path.to_string_lossy())?,
                Err(error) => {
                    if error.code == "media.scan.cancelled" {
                        return Err(error);
                    }
                    progress.failures += 1;
                    on_error(error);
                }
            }
        }
        if progress.failures == failures_before_thumbnail {
            progress.thumbnails_ready += 1;
        }
        control.checkpoint()?;
        if progress.failures == failures_before_metadata {
            repository
                .lock()
                .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
                .complete_media(video)?;
        }
        progress.processed += 1;
        progress.current_path.clear();
        control.publish(progress.clone());
        on_progress(control.status());
    }
    control.checkpoint()?;
    progress.phase = "complete".into();
    control.publish(progress.clone());
    on_progress(control.status());
    let result = repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .list();
    result
}
