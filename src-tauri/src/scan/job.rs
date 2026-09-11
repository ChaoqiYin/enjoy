use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::error::AppError;
use crate::media;
use crate::model::VideoFile;
use crate::repository::Repository;
use crate::scan::control::{ScanControl, ScanStatus};
use crate::scan::scanner;

pub fn run(
    path: &str,
    cache: &Path,
    repository: &Arc<Mutex<Repository>>,
    control: &ScanControl,
    background: bool,
    mut on_progress: impl FnMut(ScanStatus),
    mut on_error: impl FnMut(AppError),
) -> Result<Vec<VideoFile>, AppError> {
    let root = std::fs::canonicalize(path).map_err(|error| AppError::io(error, path))?;
    let files = scanner::collect_controlled(&root, || control.checkpoint())?;
    control.checkpoint()?;
    let mut progress = ScanStatus {
        phase: "processing".into(),
        background,
        discovered: files.len(),
        processed: 0,
        current_path: path.to_owned(),
        ..Default::default()
    };
    control.publish(progress.clone());
    on_progress(control.status());
    let videos = {
        let mut guard = repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?;
        progress.changes = guard.index(&root.to_string_lossy(), &files)?;
        guard.list()?
    };
    progress.indexed = files.len();
    control.publish(progress.clone());
    on_progress(control.status());
    for video in videos
        .iter()
        .filter(|video| video.available && files.iter().any(|file| file.path == video.path))
    {
        control.checkpoint()?;
        progress.current_path = video.path.clone();
        control.publish(progress.clone());
        on_progress(control.status());
        let failures_before_metadata = progress.failures;
        if video.width.is_none() {
            match media::probe(std::path::Path::new(&video.path), || control.is_cancelled()) {
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
            match media::thumbnail(
                std::path::Path::new(&video.path),
                cache,
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
