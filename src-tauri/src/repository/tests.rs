use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::repository::Repository;
use crate::scan::scanner;

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "enjoy-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn rescan_preserves_identity_and_playback_after_reopen() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("sample.MP4");
    fs::write(&movie, b"sample").unwrap();
    fs::write(fixture.0.join("notes.txt"), b"ignored").unwrap();
    let root = fixture.0.to_str().unwrap();
    let path = movie.to_str().unwrap();
    let database = fixture.0.join("index.db");
    let mut repository = Repository::open(&database).unwrap();
    repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository.favorite(path, true).unwrap();
    repository.record_play(path).unwrap();
    let before = repository.list().unwrap().remove(0);
    drop(repository);
    let mut repository = Repository::open(&database).unwrap();
    repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    let rows = repository.list().unwrap();
    assert_eq!(rows.len(), 1);
    let after = &rows[0];
    assert_eq!(before.id, after.id);
    assert_eq!(before.created_at, after.created_at);
    assert_eq!(before.updated_at, after.updated_at);
    assert!(after.favorite && after.available);
    assert_eq!(after.play_count, 1);
    assert_eq!(after.last_played_at, before.last_played_at);
    assert_eq!(repository.directories().unwrap(), vec![root]);
}

#[test]
fn deletion_marks_unavailable_and_index_removal_keeps_files() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mkv");
    fs::write(&movie, b"sample").unwrap();
    let root = fixture.0.to_str().unwrap();
    let path = movie.to_str().unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    fs::remove_file(&movie).unwrap();
    repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert!(!repository.list().unwrap()[0].available);
    fs::write(&movie, b"restored").unwrap();
    repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert!(repository.list().unwrap()[0].available);
    repository.remove(path).unwrap();
    assert!(repository.list().unwrap().is_empty());
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
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .index(
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    assert_eq!(repository.list().unwrap().len(), 1);
}

#[test]
fn failed_playback_does_not_change_history() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("clip.mp4");
    fs::write(&movie, b"sample").unwrap();
    let path = movie.to_str().unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    repository
        .index(
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    let repository = std::sync::Arc::new(std::sync::Mutex::new(repository));
    let result = crate::player::play(&repository, path, |_| {
        Err(crate::error::AppError::new(
            "media.player.start_failed",
            "Test launcher failure",
        ))
    });
    assert!(result.is_err());
    assert_eq!(repository.lock().unwrap().list().unwrap()[0].play_count, 0);
    crate::player::play(&repository, path, |file| {
        assert!(file.is_absolute());
        Ok(())
    })
    .unwrap();
    assert_eq!(repository.lock().unwrap().list().unwrap()[0].play_count, 1);
    fs::remove_file(&movie).unwrap();
    assert!(crate::player::play(&repository, path, |_| panic!(
        "Missing files must not launch"
    ))
    .is_err());
    assert_eq!(repository.lock().unwrap().list().unwrap()[0].play_count, 1);
}

#[test]
fn scan_changes_count_new_updated_and_missing_files() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("sample.mp4");
    fs::write(&movie, b"one").unwrap();
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    let root = fixture.0.to_str().unwrap();
    let first = repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((first.added, first.updated, first.unavailable), (1, 0, 0));
    let same = repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!((same.added, same.updated, same.unavailable), (0, 0, 0));
    fs::write(&movie, b"updated content").unwrap();
    let changed = repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!(
        (changed.added, changed.updated, changed.unavailable),
        (0, 1, 0)
    );
    fs::remove_file(movie).unwrap();
    let deleted = repository
        .index(root, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    assert_eq!(
        (deleted.added, deleted.updated, deleted.unavailable),
        (0, 0, 1)
    );
}

#[test]
fn legacy_progress_column_does_not_affect_history_or_serialization() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("legacy.mp4");
    fs::write(&movie, b"sample").unwrap();
    let database = fixture.0.join("index.db");
    let mut repository = Repository::open(&database).unwrap();
    repository
        .index(
            fixture.0.to_str().unwrap(),
            &scanner::collect(&fixture.0).unwrap(),
        )
        .unwrap();
    repository.favorite(movie.to_str().unwrap(), true).unwrap();
    repository.record_play(movie.to_str().unwrap()).unwrap();
    drop(repository);
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(
            "ALTER TABLE videos ADD COLUMN last_position_ms INTEGER NOT NULL DEFAULT 0;
             UPDATE videos SET last_position_ms=1234;",
        )
        .unwrap();
    drop(connection);
    let repository = Repository::open(&database).unwrap();
    repository.record_play(movie.to_str().unwrap()).unwrap();
    let video = repository.list().unwrap().remove(0);
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
    let mut repository = Repository::open(&fixture.0.join("index.db")).unwrap();
    let parent = fixture.0.to_str().unwrap();
    let child = nested.to_str().unwrap();
    repository
        .index(parent, &scanner::collect(&fixture.0).unwrap())
        .unwrap();
    repository.favorite(movie.to_str().unwrap(), true).unwrap();
    repository.record_play(movie.to_str().unwrap()).unwrap();
    let before = repository.list().unwrap().remove(0);
    repository
        .index(child, &scanner::collect(&nested).unwrap())
        .unwrap();
    assert_eq!(repository.list().unwrap().len(), 1);
    repository.remove_directory(parent).unwrap();
    fs::remove_file(&movie).unwrap();
    repository
        .index(child, &scanner::collect(&nested).unwrap())
        .unwrap();
    assert!(!repository.list().unwrap()[0].available);
    fs::write(&movie, b"restored").unwrap();
    repository
        .index(child, &scanner::collect(&nested).unwrap())
        .unwrap();
    let after = repository.list().unwrap().remove(0);
    assert_eq!(before.id, after.id);
    assert!(after.favorite && after.available);
    assert_eq!(after.play_count, 1);
    assert_eq!(repository.directories().unwrap(), vec![child]);
}
