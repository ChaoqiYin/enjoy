#[cfg(unix)]
use std::cell::Cell;
use std::fs;
use std::sync::{Arc, Mutex};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use crate::media::{MediaProcessor, Metadata};
use crate::repository::fixture::{Fixture, FIRST_SPACE};
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
    let mut repository = Repository::open(&db, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(
            space,
            &[(root.clone(), scanner::collect(&fixture.0).unwrap())],
        )
        .unwrap();
    let video = repository.list(space).unwrap().remove(0);
    repository
        .save_metadata(
            space,
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
        .save_thumbnail(space, &video, &thumbnail.to_string_lossy())
        .unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let result = job::run(
        &media,
        space,
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
    assert!(!repository.lock().unwrap().list(space).unwrap()[0].media_complete);
    drop(repository);
    let repository = Repository::open(&db, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    let repository = Arc::new(Mutex::new(repository));
    let connection = rusqlite::Connection::open(&db).unwrap();
    connection
        .execute_batch(
            "CREATE TRIGGER reject_completion BEFORE UPDATE OF media_complete ON videos
        WHEN NEW.media_complete=1 BEGIN SELECT RAISE(ABORT, 'Completion write failed'); END;",
        )
        .unwrap();
    let guard = control.begin().unwrap();
    let result = job::run(
        &media,
        space,
        &repository,
        &control,
        false,
        |_| {},
        |_| panic!("Cached work must not invoke media tools"),
    );
    assert!(result.is_err());
    drop(guard);
    assert_eq!(control.status().phase, "failed");
    assert!(!repository.lock().unwrap().list(space).unwrap()[0].media_complete);
    connection
        .execute_batch("DROP TRIGGER reject_completion;")
        .unwrap();
    drop(connection);
    for expected_visits in [true, false] {
        let guard = control.begin().unwrap();
        let mut visited = false;
        let rows = job::run(
            &media,
            space,
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

/// Gives every record a completed media state, so the media phase has nothing
/// to do and the counts under test come from the scan alone.
fn complete_media(repo: &Repository) {
    let space = repo.current_space().unwrap().id;
    for video in repo.list(space).unwrap() {
        repo.save_metadata(
            space,
            &video,
            &Metadata {
                duration_ms: Some(500),
                width: 160,
                height: 90,
                codec: None,
            },
        )
        .unwrap();
        repo.save_thumbnail(space, &video, "cached.jpg").unwrap();
        repo.complete_media(space, &video).unwrap();
    }
}

#[test]
fn a_configured_directory_that_vanished_clears_its_records_without_being_counted() {
    let fixture = Fixture::new();
    let readable = fixture.0.join("readable");
    let vanished = fixture.0.join("vanished");
    fs::create_dir(&readable).unwrap();
    fs::create_dir(&vanished).unwrap();
    fs::write(readable.join("kept.mp4"), b"kept").unwrap();
    let stranded = vanished.join("stranded.mp4");
    fs::write(&stranded, b"stranded").unwrap();
    let readable_root = readable.to_string_lossy().into_owned();
    let vanished_root = vanished.to_string_lossy().into_owned();
    let mut repo = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repo.current_space().unwrap().id;
    repo.replace_videos(
        space,
        &[
            (readable_root, scanner::collect(&readable).unwrap()),
            (vanished_root, scanner::collect(&vanished).unwrap()),
        ],
    )
    .unwrap();
    repo.favorite(space, stranded.to_str().unwrap(), true)
        .unwrap();
    repo.record_play(space, stranded.to_str().unwrap()).unwrap();
    complete_media(&repo);
    fs::remove_dir_all(&vanished).unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let rows = job::run(&media, space, &repository, &control, false, |_| {}, |_| {})
        .expect("A directory that vanished must not fail the scan");
    drop(guard);
    let status = control.status();
    assert_eq!(status.phase, "complete");
    // A directory that is no longer there reads as one whose videos all went
    // with it, not as a directory this run failed to cover.
    assert_eq!(status.unreachable_directories, 0);
    assert_eq!(status.failures, 0);
    assert_eq!(status.changes.removed, 1);
    let names: Vec<_> = rows.iter().map(|video| video.file_name.as_str()).collect();
    assert_eq!(names, vec!["kept.mp4"]);
}

#[cfg(unix)]
#[test]
fn a_configured_directory_that_cannot_be_read_is_counted_and_keeps_its_records() {
    let fixture = Fixture::new();
    let locked = fixture.0.join("locked");
    fs::create_dir(&locked).unwrap();
    let movie = locked.join("movie.mp4");
    fs::write(&movie, b"video").unwrap();
    let locked_root = locked.to_string_lossy().into_owned();
    let mut repo = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repo.current_space().unwrap().id;
    repo.replace_videos(space, &[(locked_root, scanner::collect(&locked).unwrap())])
        .unwrap();
    repo.favorite(space, movie.to_str().unwrap(), true).unwrap();
    repo.record_play(space, movie.to_str().unwrap()).unwrap();
    complete_media(&repo);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let errors = Cell::new(0);
    let rows = job::run(
        &media,
        space,
        &repository,
        &control,
        false,
        |_| {},
        |_| errors.set(errors.get() + 1),
    )
    .expect("A directory that cannot be read must not fail the scan");
    drop(guard);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    let status = control.status();
    assert_eq!(status.phase, "complete");
    assert_eq!(status.unreachable_directories, 1);
    // It is a fact about the scan's range, not a media failure: neither count
    // nor notice belongs to the other.
    assert_eq!(status.failures, 0);
    assert_eq!(errors.get(), 0);
    assert_eq!(status.changes.removed, 0);
    let video = rows
        .iter()
        .find(|video| video.path == movie.to_str().unwrap())
        .expect("The record of an unreadable directory stays");
    assert!(video.favorite);
    assert_eq!(video.play_count, 1);
    assert!(video.media_complete);
}

#[cfg(unix)]
#[test]
fn a_locked_subtree_keeps_its_records_while_the_rest_of_the_directory_is_scanned() {
    let fixture = Fixture::new();
    let locked = fixture.0.join("locked");
    fs::create_dir(&locked).unwrap();
    let stranded = locked.join("stranded.mp4");
    fs::write(&stranded, b"stranded").unwrap();
    let gone = fixture.0.join("gone.mp4");
    fs::write(&gone, b"gone").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repo = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repo.current_space().unwrap().id;
    repo.replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    repo.favorite(space, stranded.to_str().unwrap(), true)
        .unwrap();
    repo.record_play(space, stranded.to_str().unwrap()).unwrap();
    complete_media(&repo);
    fs::remove_file(&gone).unwrap();
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
    fs::write(fixture.0.join("added.mp4"), b"added").unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let rows = job::run(&media, space, &repository, &control, false, |_| {}, |_| {})
        .expect("A subtree that cannot be read must not fail the scan");
    drop(guard);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    let status = control.status();
    assert_eq!(status.phase, "complete");
    assert_eq!(status.unreachable_directories, 0);
    assert_eq!(status.changes.added, 1);
    // The file that disappeared is cleared as usual, while the record behind
    // the locked subtree stays: this run says nothing about the files in it.
    assert_eq!(status.changes.removed, 1);
    let names: Vec<_> = rows.iter().map(|video| video.file_name.as_str()).collect();
    assert!(names.contains(&"added.mp4"));
    assert!(names.contains(&"stranded.mp4"));
    assert!(!names.contains(&"gone.mp4"));
    let video = rows
        .iter()
        .find(|video| video.file_name == "stranded.mp4")
        .unwrap();
    assert!(video.favorite);
    assert_eq!(video.play_count, 1);
    assert!(video.media_complete);
}

#[cfg(unix)]
#[test]
fn a_file_that_cannot_be_read_is_indexed_and_keeps_its_record() {
    let fixture = Fixture::new();
    let locked = fixture.0.join("locked.mp4");
    fs::write(&locked, b"locked").unwrap();
    fs::write(fixture.0.join("kept.mp4"), b"kept").unwrap();
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repo = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repo.current_space().unwrap().id;
    repo.replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    repo.favorite(space, locked.to_str().unwrap(), true)
        .unwrap();
    repo.record_play(space, locked.to_str().unwrap()).unwrap();
    complete_media(&repo);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let errors = Cell::new(0);
    let rows = job::run(
        &media,
        space,
        &repository,
        &control,
        false,
        |_| {},
        |_| errors.set(errors.get() + 1),
    )
    .expect("A file that cannot be read must not fail the scan");
    drop(guard);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    let status = control.status();
    assert_eq!(status.phase, "complete");
    assert_eq!(status.unreachable_directories, 0);
    // Discovery reads metadata only, so a file the user may not read looks
    // exactly like any other file to it: the file is collected like the rest,
    // it is not a discovery failure, and nothing else moves. That is the price
    // ADR 0004 accepts -- failing to read its content is a media-phase failure
    // now, counted and notified there rather than here.
    assert_eq!(status.failures, 0);
    assert_eq!(errors.get(), 0);
    assert_eq!(
        (
            status.changes.added,
            status.changes.updated,
            status.changes.removed
        ),
        (0, 0, 0)
    );
    assert_eq!(rows.len(), 2);
    let video = rows
        .iter()
        .find(|video| video.file_name == "locked.mp4")
        .expect("The record of a file that cannot be read stays");
    assert!(video.favorite);
    assert_eq!(video.play_count, 1);
    assert!(video.media_complete);
    assert!(rows.iter().any(|video| video.file_name == "kept.mp4"));
}

#[test]
fn cancellation_aborts_the_scan_and_preserves_existing_records() {
    let fixture = Fixture::new();
    let root = fixture.0.to_string_lossy().into_owned();
    fs::write(fixture.0.join("old.mp4"), b"old").unwrap();
    let mut repo = Repository::open(&fixture.0.join("library.db"), FIRST_SPACE).unwrap();
    let space = repo.current_space().unwrap().id;
    repo.replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    fs::remove_file(fixture.0.join("old.mp4")).unwrap();
    let repository = Arc::new(Mutex::new(repo));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let result = job::run(
        &media,
        space,
        &repository,
        &control,
        false,
        |_| control.action("cancel").unwrap(),
        |_| {},
    );
    assert_eq!(result.unwrap_err().code, "media.scan.cancelled");
    drop(guard);
    assert_eq!(control.status().phase, "cancelled");
    assert_eq!(
        repository.lock().unwrap().list(space).unwrap()[0].file_name,
        "old.mp4"
    );
}

#[test]
fn a_file_whose_size_changed_is_processed_again() {
    let fixture = Fixture::new();
    let movie = fixture.0.join("movie.mp4");
    fs::write(&movie, b"first").unwrap();
    let db = fixture.0.join("library.db");
    let root = fixture.0.to_string_lossy().into_owned();
    let mut repository = Repository::open(&db, FIRST_SPACE).unwrap();
    let space = repository.current_space().unwrap().id;
    repository
        .replace_videos(space, &[(root, scanner::collect(&fixture.0).unwrap())])
        .unwrap();
    complete_media(&repository);
    // The file grows by one byte. Under ADR 0004 that alone is a changed
    // identity, so its media must be derived again instead of reused -- the
    // difference between this file and the skipped one in the case above is the
    // whole point of the change.
    fs::write(&movie, b"second").unwrap();
    let repository = Arc::new(Mutex::new(repository));
    let control = Arc::new(ScanControl::default());
    let media = MediaProcessor::on_path(fixture.0.join("cache"));
    let guard = control.begin().unwrap();
    let result = job::run(&media, space, &repository, &control, false, |_| {}, |_| {});
    assert!(result.is_ok());
    drop(guard);
    // Both halves of the media phase were attempted for it: the bytes are not a
    // video, so the probe and the thumbnail each fail and are counted. A file
    // that had been skipped would leave the count at zero.
    assert_eq!(control.status().failures, 2);
    assert!(!repository.lock().unwrap().list(space).unwrap()[0].media_complete);
}
