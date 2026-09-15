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
pub fn refresh_video(
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
            .find_file_stamp(path)?
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
        .refresh_metadata(path, expected, updated, &metadata)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{Arc, Mutex};

    use crate::error::AppError;
    use crate::media::Metadata;
    use crate::repository::tests::Fixture;
    use crate::repository::Repository;
    use crate::scan::control::ScanControl;
    use crate::scan::refresh;
    use crate::scan::scanner;

    fn setup() -> (Fixture, String, Arc<Mutex<Repository>>) {
        let fixture = Fixture::new();
        let movie = fixture.0.join("movie.mp4");
        fs::write(&movie, b"video").unwrap();
        let root = fixture.0.to_string_lossy().into_owned();
        let path = movie.to_string_lossy().into_owned();
        let mut repository = Repository::open(&fixture.0.join("library.db")).unwrap();
        repository
            .replace_videos(&[(root, scanner::collect(&fixture.0).unwrap())])
            .unwrap();
        (fixture, path, Arc::new(Mutex::new(repository)))
    }

    #[test]
    fn successful_refresh_updates_metadata_for_the_file() {
        let (_fixture, path, repository) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let wrote = refresh::refresh_video(&path, &repository, &control, |_| {
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
        let row = repository.lock().unwrap().list().unwrap().remove(0);
        assert_eq!(row.width, Some(640));
        assert_eq!(row.height, Some(360));
        assert_eq!(row.duration_ms, Some(500));
        assert_eq!(row.codec.as_deref(), Some("h264"));
        assert!(!row.media_complete);
    }

    #[test]
    fn cancellation_after_probe_returns_error_and_does_not_write() {
        let (_fixture, path, repository) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let result = refresh::refresh_video(&path, &repository, &control, |_| {
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
        assert!(repository.lock().unwrap().list().unwrap()[0]
            .width
            .is_none());
    }

    #[test]
    fn probe_cancellation_propagates_as_an_error() {
        let (_fixture, path, repository) = setup();
        let control = Arc::new(ScanControl::default());
        let guard = control.begin().unwrap();
        let result = refresh::refresh_video(&path, &repository, &control, |_| {
            control.action("cancel").unwrap();
            Err(AppError::new("media.scan.cancelled", "cancelled probe"))
        });
        assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
        drop(guard);
        assert_eq!(control.status().phase, "cancelled");
        assert!(repository.lock().unwrap().list().unwrap()[0]
            .width
            .is_none());
    }
}
