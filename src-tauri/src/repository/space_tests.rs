use std::fs;
use std::path::Path;

use crate::repository::fixture::Fixture;
use crate::repository::Repository;
use crate::scan::scanner;

/// Adds a space beside the first one. Creating spaces from the interface is a
/// later change; these tests only need a second one to exist, so they write it
/// straight into the file.
fn add_space(database: &Path, name: &str) -> i64 {
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .execute(
            "INSERT INTO spaces(name,created_at,current) VALUES (?1,0,0)",
            [name],
        )
        .unwrap();
    connection.last_insert_rowid()
}

/// A database holding one file, indexed into both spaces.
fn two_spaces_holding_the_same_file() -> (Fixture, Repository, i64, i64) {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("movie.mp4"), b"video").unwrap();
    let database = fixture.0.join("library.db");
    let mut repository = Repository::open(&database, "First").unwrap();
    let first = repository.current_space().unwrap().id;
    let second = add_space(&database, "Second");
    let scanned = vec![(
        fixture.0.to_string_lossy().into_owned(),
        scanner::collect(&fixture.0).unwrap(),
    )];
    for space in [first, second] {
        repository.replace_videos(space, &scanned).unwrap();
    }
    (fixture, repository, first, second)
}

#[test]
fn the_same_path_in_two_spaces_is_two_records_with_their_own_favorite() {
    let (_fixture, repository, first, second) = two_spaces_holding_the_same_file();
    let one = repository.list(first).unwrap();
    let other = repository.list(second).unwrap();
    assert_eq!((one.len(), other.len()), (1, 1));
    assert_eq!(one[0].path, other[0].path);
    // Two records, not one shared between them. ADR 0011 buys this at the price
    // of processing the file twice, and the price is why it is written down.
    assert_ne!(one[0].id, other[0].id);

    repository.favorite(first, &one[0].path, true).unwrap();
    assert!(repository.list(first).unwrap()[0].favorite);
    assert!(!repository.list(second).unwrap()[0].favorite);
    assert_eq!(repository.list(second).unwrap()[0].play_count, 0);
}

#[test]
fn a_scan_of_one_space_leaves_the_other_alone() {
    let (fixture, mut repository, first, second) = two_spaces_holding_the_same_file();
    // The directory is still configured, but nothing was found under it this
    // run, which is what makes the records of the first space stale.
    repository
        .replace_videos(
            first,
            &[(fixture.0.to_string_lossy().into_owned(), Vec::new())],
        )
        .unwrap();
    assert!(repository.list(first).unwrap().is_empty());
    assert_eq!(repository.list(second).unwrap().len(), 1);
}

#[test]
fn a_directory_can_be_configured_in_both_spaces_and_removed_from_one() {
    let (fixture, repository, first, second) = two_spaces_holding_the_same_file();
    let shared = fixture.0.to_string_lossy().into_owned();
    for space in [first, second] {
        repository.add_directory(space, &shared).unwrap();
    }
    assert_eq!(repository.directories(first).unwrap(), vec![shared.clone()]);
    assert_eq!(
        repository.directories(second).unwrap(),
        vec![shared.clone()]
    );

    repository.remove_directory(first, &shared).unwrap();
    assert!(repository.directories(first).unwrap().is_empty());
    assert_eq!(repository.directories(second).unwrap(), vec![shared]);
}

#[test]
fn a_path_the_space_does_not_hold_reads_as_missing() {
    let (fixture, mut repository, first, second) = two_spaces_holding_the_same_file();
    // This one is in both, so it is found in both.
    let shared = repository.list(first).unwrap()[0].path.clone();
    assert!(repository.favorite(second, &shared, true).is_ok());

    // A file only the first space has scanned belongs to it alone: the second
    // must read it as one it does not hold, not as one it holds unfavorited.
    fs::write(fixture.0.join("other.mp4"), b"video").unwrap();
    repository
        .replace_videos(
            first,
            &[(
                fixture.0.to_string_lossy().into_owned(),
                scanner::collect(&fixture.0).unwrap(),
            )],
        )
        .unwrap();
    let rows = repository.list(first).unwrap();
    let only_first = rows
        .iter()
        .find(|video| video.path.ends_with("other.mp4"))
        .unwrap()
        .path
        .clone();
    assert_eq!(
        repository
            .favorite(second, &only_first, true)
            .unwrap_err()
            .code,
        "media.file.not_found"
    );
}
