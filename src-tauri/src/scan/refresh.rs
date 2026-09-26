use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use crate::error::AppError;
use crate::media::Metadata;
use crate::model::FileStamp;
use crate::repository::Repository;
use crate::scan::control::ScanControl;

/// Refreshes a single file's media metadata. Returns `true` when the record
/// was written; `false` when a concurrent scan already updated the file (so
/// the fresh data was left untouched).
///
/// Mutual exclusion against a running scan is the caller's responsibility:
/// the command handler acquires the slot via `ScanControl::begin()` before
/// calling this. `checkpoint()` here only observes cancellation.
pub fn refresh_video(
    space_id: i64,
    path: &str,
    repository: &Arc<Mutex<Repository>>,
    control: &Arc<ScanControl>,
    probe: impl Fn(&Path) -> Result<Metadata, AppError>,
) -> Result<bool, AppError> {
    control.checkpoint()?;
    let expected = {
        let guard = repository
            .lock()
            .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?;
        guard
            .find_file_stamp(space_id, path)?
            .ok_or_else(|| AppError::new("media.file.not_found", "Video is not indexed"))?
    };
    let file = std::fs::metadata(path).map_err(|error| AppError::io(error, path))?;
    let updated = FileStamp {
        file_size: i64::try_from(file.len()).unwrap_or(i64::MAX),
        modified_at: file
            .modified()
            .map_err(|error| AppError::io(error, path))?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64,
    };
    let metadata = probe(Path::new(path))?;
    control.checkpoint()?;
    repository
        .lock()
        .map_err(|_| AppError::new("media.database.lock_failed", "Database lock poisoned"))?
        .refresh_metadata(space_id, path, expected, updated, &metadata)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{Arc, Mutex};

    use crate::error::AppError;
    use crate::media::Metadata;
    use crate::repository::fixture::{Fixture, FIRST_SPACE};
    use crate::repository::Repository;
    use crate::scan::control::ScanControl;
    use crate::scan::refresh;
    use crate::scan::scanner;

    fn setup() -> (Fixture, String, Arc<Mutex<Repository>>, i64) {
        let (fixture, mut paths, repository, space) = setup_videos(&["movie.mp4"]);
        (fixture, paths.remove(0), repository, space)
    }

    fn setup_videos(names: &[&str]) -> (Fixture, Vec<String>, Arc<Mutex<Repository>>, i64) {
        let fixture = Fixture::new();
        let mut paths = Vec::with_capacity(names.len());
        for name in names {
            let file = fixture.0.join(name);
            fs::write(&file, b"video").unwrap();
            paths.push(file.to_string_lossy().into_owned());
        }
        let root = fixture.0.to_string_lossy().into_owned();
        let mut repository = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
        let space = repository.current_space().unwrap().id;
        repository
            .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
            .unwrap();
        (fixture, paths, Arc::new(Mutex::new(repository)), space)
    }

    #[test]
    fn successful_refresh_updates_metadata_for_the_file() {
        let (_fixture, path, repository, space) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let wrote = refresh::refresh_video(space, &path, &repository, &control, |_| {
            Ok(Metadata {
                duration_ms: Some(500),
                width: 640,
                height: 360,
                codec: Some("h264".into()),
            })
        })
        .unwrap();
        assert!(wrote);
        drop(guard);
        let row = repository.lock().unwrap().list(space).unwrap().remove(0);
        assert_eq!(row.width, Some(640));
        assert_eq!(row.height, Some(360));
        assert_eq!(row.duration_ms, Some(500));
        assert_eq!(row.codec.as_deref(), Some("h264"));
        assert!(!row.media_complete);
    }

    #[test]
    fn cancellation_after_probe_returns_error_and_does_not_write() {
        let (_fixture, path, repository, space) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let result = refresh::refresh_video(space, &path, &repository, &control, |_| {
            control.action("cancel").unwrap();
            Ok(Metadata {
                duration_ms: None,
                width: 1920,
                height: 1080,
                codec: None,
            })
        });
        assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
        drop(guard);
        assert_eq!(control.status().phase, "cancelled");
        assert!(repository.lock().unwrap().list(space).unwrap()[0]
            .width
            .is_none());
    }

    #[test]
    fn probe_cancellation_propagates_as_an_error() {
        let (_fixture, path, repository, space) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let result = refresh::refresh_video(space, &path, &repository, &control, |_| {
            control.action("cancel").unwrap();
            Err(AppError::new("media.scan.cancelled", "cancelled probe"))
        });
        assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
        drop(guard);
        assert_eq!(control.status().phase, "cancelled");
        assert!(repository.lock().unwrap().list(space).unwrap()[0]
            .width
            .is_none());
    }

    #[test]
    fn successful_refresh_updates_only_the_target_file() {
        let (_fixture, paths, repository, space) = setup_videos(&["movie.mp4", "other.mkv"]);
        let path = paths
            .iter()
            .find(|video| video.ends_with("movie.mp4"))
            .unwrap()
            .clone();
        let (other_id, other_size) = {
            let repo = repository.lock().unwrap();
            let rows = repo.list(space).unwrap();
            let target = rows.iter().find(|video| video.path == path).unwrap();
            let other = rows.iter().find(|video| video.path != path).unwrap();
            let other_id = other.id;
            let other_size = other.file_size;
            repo.save_metadata(
                space,
                other,
                &Metadata {
                    duration_ms: Some(700),
                    width: 320,
                    height: 200,
                    codec: Some("xvid".into()),
                },
            )
            .unwrap();
            repo.save_thumbnail(space, target, "cached.jpg").unwrap();
            (other_id, other_size)
        };
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let wrote = refresh::refresh_video(space, &path, &repository, &control, |_| {
            Ok(Metadata {
                duration_ms: Some(500),
                width: 160,
                height: 90,
                codec: Some("mpeg4".into()),
            })
        })
        .unwrap();
        assert!(wrote);
        drop(guard);
        let rows = repository.lock().unwrap().list(space).unwrap();
        let target = rows.iter().find(|video| video.path == path).unwrap();
        assert_eq!(target.width, Some(160));
        assert_eq!(target.height, Some(90));
        assert_eq!(target.duration_ms, Some(500));
        assert_eq!(target.codec.as_deref(), Some("mpeg4"));
        assert_eq!(target.thumbnail_path.as_deref(), Some("cached.jpg"));
        assert!(target.media_complete);
        let other = rows.iter().find(|video| video.id == other_id).unwrap();
        assert_eq!(other.file_size, other_size);
        assert_eq!(other.width, Some(320));
        assert_eq!(other.height, Some(200));
        assert_eq!(other.duration_ms, Some(700));
        assert_eq!(other.codec.as_deref(), Some("xvid"));
        assert_eq!(other.thumbnail_path, None);
        assert!(!other.media_complete);
    }

    #[test]
    fn failed_probe_preserves_existing_record_without_partial_write() {
        let (_fixture, path, repository, space) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        refresh::refresh_video(space, &path, &repository, &control, |_| {
            Ok(Metadata {
                duration_ms: Some(500),
                width: 640,
                height: 360,
                codec: Some("h264".into()),
            })
        })
        .unwrap();
        drop(guard);
        let before = repository.lock().unwrap().list(space).unwrap().remove(0);
        let guard = control.begin().unwrap();
        let result = refresh::refresh_video(space, &path, &repository, &control, |_| {
            Err(AppError::new(
                "media.metadata.failed",
                "probe could not read the stream",
            ))
        });
        assert_eq!(result.unwrap_err().code, "media.metadata.failed");
        drop(guard);
        let after = repository.lock().unwrap().list(space).unwrap().remove(0);
        assert_eq!(after.file_size, before.file_size);
        assert_eq!(after.modified_at, before.modified_at);
        assert_eq!(after.width, Some(640));
        assert_eq!(after.height, Some(360));
        assert_eq!(after.duration_ms, Some(500));
        assert_eq!(after.codec.as_deref(), Some("h264"));
        assert!(!after.media_complete);
    }

    #[test]
    fn refresh_video_does_not_overwrite_a_concurrent_scan() {
        let (fixture, paths, repository, space) = setup_videos(&["clip.mp4"]);
        let path = paths[0].clone();
        let root = fixture.0.to_string_lossy().into_owned();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        // The rescan below moves the file while the refresh is in flight, and
        // the write is refused afterwards: the stamps the refresh read are the
        // very fields the scan now compares to decide whether a file changed
        // (ADR 0004), so growing the file is all it takes to lose the race.
        let wrote = refresh::refresh_video(space, &path, &repository, &control, |file| {
            fs::write(file, b"updated content").unwrap();
            repository
                .lock()
                .unwrap()
                .replace_videos(
                    space,
                    &[(root.clone(), scanner::collect(&fixture.0).unwrap())],
                )
                .unwrap();
            Ok(Metadata {
                duration_ms: Some(500),
                width: 640,
                height: 360,
                codec: Some("h264".into()),
            })
        })
        .unwrap();
        assert!(!wrote);
        drop(guard);
        let row = repository.lock().unwrap().list(space).unwrap().remove(0);
        assert_eq!(row.file_size, 15);
        assert!(row.width.is_none());
        assert!(row.duration_ms.is_none());
        assert!(!row.media_complete);
    }

    #[test]
    fn successful_refresh_flips_media_complete_once_thumbnail_exists() {
        let (_fixture, path, repository, space) = setup();
        let video = repository.lock().unwrap().list(space).unwrap().remove(0);
        repository
            .lock()
            .unwrap()
            .save_thumbnail(space, &video, "cached.jpg")
            .unwrap();
        assert!(!repository.lock().unwrap().list(space).unwrap()[0].media_complete);
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let wrote = refresh::refresh_video(space, &path, &repository, &control, |_| {
            Ok(Metadata {
                duration_ms: None,
                width: 160,
                height: 90,
                codec: None,
            })
        })
        .unwrap();
        assert!(wrote);
        drop(guard);
        let row = repository.lock().unwrap().list(space).unwrap().remove(0);
        assert!(row.media_complete);
        assert_eq!(row.width, Some(160));
        assert_eq!(row.thumbnail_path.as_deref(), Some("cached.jpg"));
    }
}
