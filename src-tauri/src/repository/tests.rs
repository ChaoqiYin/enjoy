use std::fs;

use crate::repository::fixture::{Fixture, FIRST_SPACE};
use crate::repository::Repository;
use crate::scan::scanner;

#[test]
fn rescan_preserves_identity_and_playback_after_reopen() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("sample.MP4");
    fs::write(&movie, b"sample").unwrap();
    fs::write(fixture.0.join("notes.txt"), b"ignored").unwrap();
    let root = fixture.0.to_str().unwrap();
    let path = movie.to_str().unwrap();
    let database = fixture.0.join("index.db");
    let mut repository = Repository::open(&database, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository.favorite(space, path, true).unwrap();
    repository.record_play(space, path).unwrap();
    let before = repository.list(space).unwrap().remove(0);
    drop(repository);
    let mut repository = Repository::open(&database, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    let rows = repository.list(space).unwrap();
    assert_eq!(rows.len(), 1);
    let after = &rows[0];
    assert_eq!(before.id, after.id);
    assert_eq!(before.created_at, after.created_at);
    assert_eq!(before.updated_at, after.updated_at);
    assert!(after.favorite);
    assert_eq!(after.play_count, 1);
    assert_eq!(after.last_played_at, before.last_played_at);
    assert_eq!(repository.directories(space).unwrap(), vec![root]);
}

#[test]
fn a_scanned_directory_clears_the_stale_records_of_files_it_no_longer_holds() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mkv");
    fs::write(&movie, b"sample").unwrap();
    let root = fixture.0.to_str().unwrap();
    let path = movie.to_str().unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository.favorite(space, path, true).unwrap();
    repository.record_play(space, path).unwrap();
    fs::remove_file(&movie).unwrap();
    // The directory was read successfully and the file was not in it, so the
    // record is stale and its user state goes with it, as ADR 0003 accepts.
    let changes = repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((changes.added, changes.updated, changes.removed), (0, 0, 1));
    assert!(repository.list(space).unwrap().is_empty());
    fs::write(&movie, b"restored").unwrap();
    repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    let restored = repository.list(space).unwrap().remove(0);
    assert!(!restored.favorite);
    assert_eq!(restored.play_count, 0);
    repository.remove(space, path).unwrap();
    assert!(repository.list(space).unwrap().is_empty());
    assert!(movie.exists());
}

#[test]
fn invalid_scan_is_an_error_and_does_not_replace_index() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.webm");
    fs::write(&movie, b"sample").unwrap();
    assert_eq!(
        scanner::collect(&movie).unwrap_err().code,
        "media.directory.invalid"
    );
    assert_eq!(
        scanner::collect(&fixture.0.join("missing"))
            .unwrap_err()
            .code,
        "media.file.not_found"
    );
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(
            space,
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    assert_eq!(repository.list(space).unwrap().len(), 1);
}

#[test]
fn failed_playback_does_not_change_history() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"sample").unwrap();
    let path = movie.to_str().unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(
            space,
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    let repository = std::sync::Arc::new(std::sync::Mutex::new(repository));
    let result = crate::player::play(space, &repository, path, |_| {
        Err(crate::error::AppError::new(
            "media.player.start_failed",
            "Test launcher failure",
        ))
    });
    assert!(result.is_err());
    assert_eq!(
        repository.lock().unwrap().list(space).unwrap()[0].play_count,
        0
    );
    crate::player::play(space, &repository, path, |file| {
        assert!(file.is_absolute());
        Ok(())
    })
    .unwrap();
    assert_eq!(
        repository.lock().unwrap().list(space).unwrap()[0].play_count,
        1
    );
    fs::remove_file(&movie).unwrap();
    assert!(crate::player::play(space, &repository, path, |_| panic!(
        "Missing files must not launch"
    ))
    .is_err());
    assert_eq!(
        repository.lock().unwrap().list(space).unwrap()[0].play_count,
        1
    );
}

#[test]
fn scan_changes_count_new_and_updated_files() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("sample.mp4");
    fs::write(&movie, b"one").unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let root = fixture.0.to_str().unwrap();
    let first = repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((first.added, first.updated), (1, 0));
    let same = repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((same.added, same.updated), (0, 0));
    // The rewrite is longer than what it replaces, so the file's size moves and
    // the change is caught -- size and modification time are the whole rule now
    // (ADR 0004), not a hint that a content hash still confirms.
    fs::write(&movie, b"updated content").unwrap();
    let changed = repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((changed.added, changed.updated), (0, 1));
    fs::remove_file(movie).unwrap();
    let deleted = repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((deleted.added, deleted.updated), (0, 0));
}

#[test]
fn legacy_progress_column_does_not_affect_history_or_serialization() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("legacy.mp4");
    fs::write(&movie, b"sample").unwrap();
    let database = fixture.0.join("index.db");
    let mut repository = Repository::open(&database, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(
            space,
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    repository
        .favorite(space, movie.to_str().unwrap(), true)
        .unwrap();
    repository
        .record_play(space, movie.to_str().unwrap())
        .unwrap();
    drop(repository);
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(
            "ALTER TABLE videos ADD COLUMN last_position_ms INTEGER NOT NULL DEFAULT 0;
             UPDATE videos SET last_position_ms=1234;",
        )
        .unwrap();
    drop(connection);
    let repository = Repository::open(&database, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .record_play(space, movie.to_str().unwrap())
        .unwrap();
    let video = repository.list(space).unwrap().remove(0);
    assert!(video.favorite && video.last_played_at.is_some());
    assert_eq!(video.play_count, 2);
    assert!(serde_json::to_value(video)
        .unwrap()
        .get("last_position_ms")
        .is_none());
    let connection = rusqlite::Connection::open(&database).unwrap();
    let position: i64 = connection
        .query_row("SELECT last_position_ms FROM videos", [], |row| row.get(0))
        .unwrap();
    assert_eq!(position, 1234);
}

#[test]
fn overlapping_directories_share_identity_and_keep_tracking_after_removal() {
    let fixture = Fixture::new();
    let nested = fixture.0.join("nested");
    fs::create_dir(&nested).unwrap();
    let movie = nested.join("sample.mp4");
    fs::write(&movie, b"sample").unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let parent = fixture.0.to_str().unwrap();
    let child = nested.to_str().unwrap();
    repository
        .index(space, parent, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository
        .favorite(space, movie.to_str().unwrap(), true)
        .unwrap();
    repository
        .record_play(space, movie.to_str().unwrap())
        .unwrap();
    let before = repository.list(space).unwrap().remove(0);
    repository
        .index(space, child, &scanner::collect(&nested).unwrap())
        .unwrap();
    assert_eq!(repository.list(space).unwrap().len(), 1);
    repository.remove_directory(space, parent).unwrap();
    repository
        .index(space, child, &scanner::collect(&nested).unwrap())
        .unwrap();
    let after = repository.list(space).unwrap().remove(0);
    assert_eq!(before.id, after.id);
    assert!(after.favorite);
    assert_eq!(after.play_count, 1);
    assert_eq!(repository.directories(space).unwrap(), vec![child]);
}

#[test]
fn replacing_all_videos_merges_roots_and_preserves_user_state() {
    let fixture = Fixture::new();
    let first = fixture.0.join("first");
    let second = fixture.0.join("second");
    fs::create_dir(&first).unwrap();
    fs::create_dir(&second).unwrap();
    let movie = first.join("first.mp4");
    fs::write(&movie, b"video").unwrap();
    fs::write(second.join("second.mp4"), b"video").unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .index(
            space,
            first.to_str().unwrap(),
            &scanner::collect(&first).unwrap(),
        )
        .unwrap();
    repository
        .favorite(space, movie.to_str().unwrap(), true)
        .unwrap();
    repository
        .record_play(space, movie.to_str().unwrap())
        .unwrap();
    repository
        .replace_videos(
            space,
            &[
                (
                    first.to_string_lossy().into_owned(),
                    scanner::collect(&first).unwrap(),
                ),
                (
                    second.to_string_lossy().into_owned(),
                    scanner::collect(&second).unwrap(),
                ),
            ],
        )
        .unwrap();
    let videos = repository.list(space).unwrap();
    assert_eq!(videos.len(), 2);
    let retained = videos
        .iter()
        .find(|video| video.path == movie.to_string_lossy())
        .unwrap();
    assert!(retained.favorite);
    assert_eq!(retained.play_count, 1);
    assert!(retained.last_played_at.is_some());
    let directories = repository.directories(space).unwrap();
    assert_eq!(directories.len(), 2);
    // A scan with nothing configured clears every record: none of them belongs
    // to the scan universe any more. Removing the last directory is what
    // empties the universe, so those records need no delete of their own.
    for directory in directories {
        repository.remove_directory(space, &directory).unwrap();
    }
    repository.replace_videos(space, &[]).unwrap();
    assert!(repository.list(space).unwrap().is_empty());
    assert!(repository.directories(space).unwrap().is_empty());
}

#[test]
fn replacement_write_failure_rolls_back_deletion_and_user_state() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("sample.mp4");
    fs::write(&movie, b"video").unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db"), FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let root = fixture.0.to_str().unwrap();
    repository
        .index(space, root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository
        .favorite(space, movie.to_str().unwrap(), true)
        .unwrap();
    let previous_id = repository.list(space).unwrap()[0].id;
    repository.connection.execute_batch("CREATE TRIGGER reject_insert BEFORE INSERT ON videos BEGIN SELECT RAISE(ABORT, 'Rejected'); END;").unwrap();
    assert!(repository
        .replace_videos(
            space,
            &[(root.into(), scanner::collect(&fixture.0).unwrap())]
        )
        .is_err());
    let videos = repository.list(space).unwrap();
    assert_eq!(videos.len(), 1);
    assert_eq!(videos[0].id, previous_id);
    assert!(videos[0].favorite);
}
