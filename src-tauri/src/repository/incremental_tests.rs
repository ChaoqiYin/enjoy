use std::cell::Cell;
use std::fs;

use crate::error::AppError;
use crate::media::Metadata;
use crate::repository::tests::Fixture;
use crate::repository::Repository;
use crate::scan::scanner;

#[test]
fn completed_identity_survives_reopen_and_content_change_resets_media() {
    let fixture = Fixture::new();
    let path = fixture.0.join("movie.mp4");
    fs::write(&path, b"first").unwrap();
    let db = fixture.0.join("library.db");
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repository = Repository::open(&db).unwrap();
    let original = scanner::collect(&fixture.0).unwrap();
    let modified = original[0].modified_at;
    repository
        .replace_videos(&[(root.clone(), original)])
        .unwrap();
    let video = repository.list().unwrap().remove(0);
    assert!(!video.media_complete);
    repository
        .save_metadata(
            &video,
            &Metadata {
                duration_ms: Some(500),
                width: 160,
                height: 90,
                codec: Some("mpeg4".into()),
            },
        )
        .unwrap();
    repository.save_thumbnail(&video, "cached.jpg").unwrap();
    repository.complete_media(&video).unwrap();
    drop(repository);
    let mut repository = Repository::open(&db).unwrap();
    let mut unchanged = scanner::collect(&fixture.0).unwrap();
    unchanged[0].modified_at += 1000;
    repository
        .replace_videos(&[(root.clone(), unchanged)])
        .unwrap();
    let retained = repository.list().unwrap().remove(0);
    assert!(retained.media_complete);
    assert_eq!(retained.thumbnail_path.as_deref(), Some("cached.jpg"));
    assert_eq!(retained.id, video.id);
    fs::write(&path, b"other").unwrap();
    let mut changed = scanner::collect(&fixture.0).unwrap();
    changed[0].modified_at = modified + 1000;
    let changes = repository.replace_videos(&[(root, changed)]).unwrap();
    assert_eq!(changes.updated, 1);
    let pending = repository.list().unwrap().remove(0);
    assert!(!pending.media_complete);
    assert!(pending.width.is_none() && pending.thumbnail_path.is_none());
    repository.complete_media(&video).unwrap();
    assert!(!repository.list().unwrap()[0].media_complete);
}

#[test]
fn cancellation_before_commit_rolls_back_insertions_and_deletions() {
    let fixture = Fixture::new();
    let root = fixture.0.to_string_lossy().into_owned();
    let old = fixture.0.join("old.mp4");
    fs::write(&old, b"old").unwrap();
    let mut repository = Repository::open(&fixture.0.join("library.db")).unwrap();
    repository
        .replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    fs::remove_file(old).unwrap();
    fs::write(fixture.0.join("new.mp4"), b"new").unwrap();
    let calls = Cell::new(0);
    let result = repository.replace_videos_controlled(
        &[(root.clone(), scanner::collect(&fixture.0).unwrap())],
        || {
            calls.set(calls.get() + 1);
            if calls.get() == 5 {
                Err(AppError::new(
                    "media.scan.cancelled",
                    "Cancelled before commit",
                ))
            } else {
                Ok(())
            }
        },
    );
    assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
    assert_eq!(repository.list().unwrap()[0].file_name, "old.mp4");
    repository
        .replace_videos(&[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].file_name, "new.mp4");
}

#[test]
fn old_schema_is_reset_once_and_new_database_survives_reopen() {
    let fixture = Fixture::new();
    let db = fixture.0.join("library.db");
    let connection = rusqlite::Connection::open(&db).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE videos(path TEXT); INSERT INTO videos VALUES ('old');
        CREATE TABLE directories(path TEXT); INSERT INTO directories VALUES ('old');
        PRAGMA user_version=1;",
        )
        .unwrap();
    drop(connection);
    let repository = Repository::open(&db).unwrap();
    assert!(repository.list().unwrap().is_empty());
    assert!(repository.directories().unwrap().is_empty());
    repository.add_directory("saved").unwrap();
    drop(repository);
    assert_eq!(
        Repository::open(&db).unwrap().directories().unwrap(),
        vec!["saved"]
    );
}
