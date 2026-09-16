use std::cell::Cell;
use std::fs;

use crate::error::AppError;
use crate::media::Metadata;
use crate::repository::tests::Fixture;
use crate::repository::{DirectoryScan, Repository};
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
fn a_changed_file_identity_restarts_media_processing_and_keeps_usage_history() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("movie.mp4");
    fs::write(&movie, b"first").unwrap();
    let database = fixture.0.join("library.db");
    let root = fixture.0.to_string_lossy().into_owned();
    let path = movie.to_string_lossy().into_owned();
    let mut repository = Repository::open(&database).unwrap();
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
                codec: Some("mpeg4".into()),
            },
        )
        .unwrap();
    repository.save_thumbnail(&video, "cached.jpg").unwrap();
    repository.complete_media(&video).unwrap();
    repository.favorite(&path, true).unwrap();
    repository.record_play(&path).unwrap();
    let before = repository.list().unwrap().remove(0);
    assert!(before.media_complete);
    // The same path now holds other content: the file identity changed, while
    // the path -- which is what the record and its use are anchored to -- did
    // not.
    fs::write(&movie, b"second").unwrap();
    let changes = repository
        .replace_videos(&[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    assert_eq!((changes.added, changes.updated, changes.removed), (0, 1, 0));
    let after = repository.list().unwrap().remove(0);
    assert_eq!(after.id, before.id);
    assert_eq!(after.created_at, before.created_at);
    // Processed media belong to the identity that produced them, so they go.
    assert!(!after.media_complete);
    assert!(after.duration_ms.is_none());
    assert!(after.width.is_none() && after.height.is_none() && after.codec.is_none());
    assert!(after.thumbnail_path.is_none());
    // The record and its use do not.
    assert!(after.favorite);
    assert_eq!(after.play_count, 1);
    assert_eq!(after.last_played_at, before.last_played_at);
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
        &[DirectoryScan {
            path: root.clone(),
            files: Some(scanner::collect(&fixture.0).unwrap()),
            unreadable: Vec::new(),
        }],
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

#[test]
fn a_version_2_database_is_upgraded_in_place_and_keeps_what_it_holds() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE videos (
                id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
                file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL, file_md5 TEXT NOT NULL,
                media_complete INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
                thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                available INTEGER NOT NULL DEFAULT 1, play_count INTEGER NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE directories (path TEXT PRIMARY KEY);
             CREATE TABLE directory_videos (
                directory_path TEXT REFERENCES directories(path) ON DELETE CASCADE,
                video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
                PRIMARY KEY(directory_path, video_id));
             INSERT INTO directories VALUES ('/movies');
             INSERT INTO videos VALUES (1,'/movies/kept.mp4','kept.mp4','/movies',10,20,'abc',
                1,500,160,90,'h264','cached.jpg',1,1,3,7,30,40);
             INSERT INTO directory_videos VALUES ('/movies',1);
             PRAGMA user_version=2;",
        )
        .unwrap();
    drop(connection);
    let repository = Repository::open(&database).unwrap();
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    let video = &rows[0];
    assert_eq!(video.id, 1);
    assert_eq!(video.created_at, 30);
    assert!(video.media_complete);
    assert_eq!(video.duration_ms, Some(500));
    assert_eq!(video.thumbnail_path.as_deref(), Some("cached.jpg"));
    assert!(video.favorite);
    assert_eq!(video.play_count, 3);
    assert_eq!(video.last_played_at, Some(7));
    assert_eq!(repository.directories().unwrap(), vec!["/movies"]);
    let connection = rusqlite::Connection::open(&database).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 3);
    let columns: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('videos') WHERE name = 'available'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(columns, 0);
    drop(connection);
    // Opening it again finds the current version and touches nothing.
    let repository = Repository::open(&database).unwrap();
    assert_eq!(repository.list().unwrap()[0].play_count, 3);
}

#[test]
fn full_sync_reports_records_it_removes() {
    let fixture = Fixture::new();
    let root = fixture.0.to_string_lossy().into_owned();
    let gone = fixture.0.join("gone.mp4");
    fs::write(&gone, b"gone").unwrap();
    fs::write(fixture.0.join("kept.mp4"), b"kept").unwrap();
    let mut repository = Repository::open(&fixture.0.join("library.db")).unwrap();
    repository
        .replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    let settled = repository
        .replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    assert_eq!((settled.added, settled.updated, settled.removed), (0, 0, 0));
    fs::remove_file(&gone).unwrap();
    let pruned = repository
        .replace_videos(&[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    assert_eq!((pruned.added, pruned.updated, pruned.removed), (0, 0, 1));
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].file_name, "kept.mp4");
}

#[test]
fn a_removed_configured_directory_keeps_its_records_until_the_next_scan() {
    let fixture = Fixture::new();
    let kept = fixture.0.join("kept");
    let dropped = fixture.0.join("dropped");
    fs::create_dir(&kept).unwrap();
    fs::create_dir(&dropped).unwrap();
    fs::write(kept.join("kept.mp4"), b"video").unwrap();
    fs::write(dropped.join("dropped.mp4"), b"video").unwrap();
    let kept_root = kept.to_string_lossy().into_owned();
    let dropped_root = dropped.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .replace_videos(&[
            (kept_root.clone(), scanner::collect(&kept).unwrap()),
            (dropped_root.clone(), scanner::collect(&dropped).unwrap()),
        ])
        .unwrap();
    assert_eq!(repository.list().unwrap().len(), 2);
    // Removing a saved directory only drops the configuration: it triggers no
    // scan, and its records leave the library on the next one, because their
    // directory is no longer part of the scan universe.
    repository.remove_directory(&dropped_root).unwrap();
    assert_eq!(repository.list().unwrap().len(), 2);
    let removed = repository
        .replace_videos(&[(kept_root, scanner::collect(&kept).unwrap())])
        .unwrap()
        .removed;
    assert_eq!(removed, 1);
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].file_name, "kept.mp4");
}

#[test]
fn unreadable_directories_keep_their_records_while_scanned_ones_are_cleaned() {
    let fixture = Fixture::new();
    let cleared = fixture.0.join("cleared");
    let skipped = fixture.0.join("skipped");
    fs::create_dir(&cleared).unwrap();
    fs::create_dir(&skipped).unwrap();
    fs::write(cleared.join("gone.mp4"), b"video").unwrap();
    fs::write(skipped.join("stranded.mp4"), b"video").unwrap();
    let cleared_root = cleared.to_string_lossy().into_owned();
    let skipped_root = skipped.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .replace_videos(&[
            (cleared_root.clone(), scanner::collect(&cleared).unwrap()),
            (skipped_root.clone(), scanner::collect(&skipped).unwrap()),
        ])
        .unwrap();
    fs::remove_file(cleared.join("gone.mp4")).unwrap();
    let changes = repository
        .replace_videos_controlled(
            &[
                // Read successfully, and now empty: its records are all stale.
                DirectoryScan {
                    path: cleared_root,
                    files: Some(scanner::collect(&cleared).unwrap()),
                    unreadable: Vec::new(),
                },
                // Could not be read: this scan says nothing about its records.
                DirectoryScan {
                    path: skipped_root,
                    files: None,
                    unreadable: Vec::new(),
                },
            ],
            || Ok(()),
        )
        .unwrap();
    assert_eq!((changes.added, changes.updated, changes.removed), (0, 0, 1));
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].file_name, "stranded.mp4");
}

#[test]
fn a_path_that_is_still_there_but_could_not_be_read_keeps_its_record() {
    let fixture = Fixture::new();
    let locked = fixture.0.join("locked");
    let private = fixture.0.join("private");
    fs::create_dir(&locked).unwrap();
    fs::create_dir(&private).unwrap();
    fs::write(fixture.0.join("kept.mp4"), b"video").unwrap();
    fs::write(locked.join("stranded.mp4"), b"video").unwrap();
    fs::write(private.join("secret.mp4"), b"video").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .replace_videos(&[(root.clone(), scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    assert_eq!(repository.list().unwrap().len(), 3);
    // The pass found only the file it could read, and reports the paths that
    // failed although they are still there: a subtree that could not be listed
    // and a file that could not be opened. Neither of them is in `files`.
    let readable: Vec<_> = scanner::collect(&fixture.0)
        .unwrap()
        .into_iter()
        .filter(|file| file.file_name == "kept.mp4")
        .collect();
    let changes = repository
        .replace_videos_controlled(
            &[DirectoryScan {
                path: root.clone(),
                files: Some(readable.clone()),
                unreadable: vec![
                    locked.to_string_lossy().into_owned(),
                    private.join("secret.mp4").to_string_lossy().into_owned(),
                ],
            }],
            || Ok(()),
        )
        .unwrap();
    assert_eq!((changes.added, changes.updated, changes.removed), (0, 0, 0));
    let names: Vec<_> = repository
        .list()
        .unwrap()
        .into_iter()
        .map(|video| video.file_name)
        .collect();
    assert_eq!(names.len(), 3);
    assert!(names.contains(&"stranded.mp4".to_string()));
    assert!(names.contains(&"secret.mp4".to_string()));
    // They survive because they were reported, not because the paths are under
    // a directory this pass left out: the very same pass without them clears
    // both records, while the file it did read is untouched.
    let changes = repository
        .replace_videos_controlled(
            &[DirectoryScan {
                path: root,
                files: Some(readable),
                unreadable: Vec::new(),
            }],
            || Ok(()),
        )
        .unwrap();
    assert_eq!((changes.added, changes.updated, changes.removed), (0, 0, 2));
    let names: Vec<_> = repository
        .list()
        .unwrap()
        .into_iter()
        .map(|video| video.file_name)
        .collect();
    assert_eq!(names, vec!["kept.mp4"]);
}
