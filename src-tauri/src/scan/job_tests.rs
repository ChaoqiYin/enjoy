use std::fs;
use std::sync::{Arc, Mutex};

use crate::media::{MediaProcessor, Metadata};
use crate::repository::tests::Fixture;
use crate::repository::Repository;
use crate::scan::control::ScanControl;
use crate::scan::{job, scanner};

#[test]
fn cancelled_processing_resumes_after_reopen_and_completed_files_are_skipped() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("movie.mp4"), b"video").unwrap();
    let thumbnail = fixture.0.join("cached.jpg");
    fs::write(&thumbnail, b"cache").unwrap();
    let db = fixture.0.join("library.db");
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repository = Repository::open(&db).unwrap();
    repository
        .replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let video = repository.list().unwrap().remove(0);
    repository
        .save_metadata(
            &video,
            &Metadata {
                duration_ms: Some(500),
                width: 160,
                height: 90,
                codec: None,
            },
        )
        .unwrap();
    repository
        .save_thumbnail(&video, &thumbnail.to_string_lossy())
        .unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let result = job::run(
        std::slice::from_ref(&root),
        &media,
        &repository,
        &control,
        false,
        |status| {
            if status.metadata_ready == 1 {
                control.action("cancel").unwrap();
            }
        },
        |_| panic!("Cached work must not invoke media tools"),
    );
    assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
    drop(guard);
    assert_eq!(control.status().phase, "cancelled");
    assert!(!repository.lock().unwrap().list().unwrap()[0].media_complete);
    drop(repository);
    let repository = Arc::new(Mutex::new(Repository::open(&db).unwrap()));
    let connection = rusqlite::Connection::open(&db).unwrap();
    connection
        .execute_batch(
            "CREATE TRIGGER reject_completion BEFORE UPDATE OF media_complete ON videos
        WHEN NEW.media_complete=1 BEGIN SELECT RAISE(ABORT, 'Completion write failed'); END;",
        )
        .unwrap();
    let guard = control.begin().unwrap();
    let result = job::run(
        std::slice::from_ref(&root),
        &media,
        &repository,
        &control,
        false,
        |_| {},
        |_| panic!("Cached work must not invoke media tools"),
    );
    assert!(result.is_err());
    drop(guard);
    assert_eq!(control.status().phase, "failed");
    assert!(!repository.lock().unwrap().list().unwrap()[0].media_complete);
    connection
        .execute_batch("DROP TRIGGER reject_completion;")
        .unwrap();
    drop(connection);
    for expected_visits in [true, false] {
        let guard = control.begin().unwrap();
        let mut visited = false;
        let rows = job::run(
            std::slice::from_ref(&root),
            &media,
            &repository,
            &control,
            false,
            |status| visited |= status.current_path == video.path,
            |_| panic!("Cached work must not invoke media tools"),
        )
        .unwrap();
        drop(guard);
        assert_eq!(visited, expected_visits);
        assert!(rows[0].media_complete);
        assert_eq!(rows[0].thumbnail_path.as_deref(), thumbnail.to_str());
        let status = control.status();
        assert_eq!(
            (
                status.processed,
                status.metadata_ready,
                status.thumbnails_ready
            ),
            (1, 1, 1)
        );
    }
}

#[test]
fn discovery_failure_or_cancellation_preserves_existing_records() {
    let fixture = Fixture::new();
    let root = fixture.0.to_string_lossy().into_owned();
    fs::write(fixture.0.join("old.mp4"), b"old").unwrap();
    let mut repo = Repository::open(&fixture.0.join("library.db")).unwrap();
    repo.replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    fs::remove_file(fixture.0.join("old.mp4")).unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    for cancel in [false, true] {
        let guard = control.begin().unwrap();
        let result = job::run(
            &[
                root.clone(),
                fixture.0.join("missing").to_string_lossy().into_owned(),
            ],
            &media,
            &repository,
            &control,
            false,
            |_| {
                if cancel {
                    control.action("cancel").unwrap();
                }
            },
            |_| {},
        );
        assert!(result.is_err());
        drop(guard);
        assert_eq!(
            control.status().phase,
            if cancel { "cancelled" } else { "failed" }
        );
        assert_eq!(
            repository.lock().unwrap().list().unwrap()[0].file_name,
            "old.mp4"
        );
    }
}
