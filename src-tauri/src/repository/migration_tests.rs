use std::path::Path;

use crate::repository::fixture::Fixture;
use crate::repository::Repository;

/// Writes the three tables version 4 shipped, plus the legacy columns an older
/// version carried. One text serves every case: the columns a version had
/// dropped are simply not asked for, and the ones it carried are nullable here
/// because the inserts below never mention them.
fn write_legacy_library(database: &Path, legacy: &[&str], version: i64) {
    let legacy_columns: String = legacy.iter().map(|name| format!(", {name} TEXT")).collect();
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .execute_batch(&format!(
            "CREATE TABLE videos (
                id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
                file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL{legacy_columns},
                media_complete INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
                thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE directories (path TEXT PRIMARY KEY);
             CREATE TABLE directory_videos (
                directory_path TEXT REFERENCES directories(path) ON DELETE CASCADE,
                video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
                PRIMARY KEY(directory_path, video_id));
             INSERT INTO directories VALUES ('/movies');
             INSERT INTO videos (id,path,file_name,folder_path,file_size,modified_at,
                media_complete,duration_ms,width,height,codec,thumbnail_path,
                favorite,play_count,last_played_at,created_at,updated_at)
             VALUES (1,'/movies/kept.mp4','kept.mp4','/movies',10,20,
                1,500,160,90,'h264','cached.jpg',1,3,7,30,40);
             INSERT INTO directory_videos VALUES ('/movies',1);
             PRAGMA user_version={version};"
        ))
        .unwrap();
}

fn version_of(database: &Path) -> i64 {
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

fn column_present(database: &Path, table: &str, column: &str) -> bool {
    let connection = rusqlite::Connection::open(database).unwrap();
    let count: i64 = connection
        .query_row(
            &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
            [column],
            |row| row.get(0),
        )
        .unwrap();
    count > 0
}

/// What every upgrade has to carry across, asked in one place so each version's
/// test puts the same question: the record itself, its use, the saved
/// directory, and everything the media phase had already written.
fn assert_library_survived(repository: &Repository, space_id: i64) {
    let rows = repository.list(space_id).unwrap();
    assert_eq!(rows.len(), 1);
    let video = &rows[0];
    assert_eq!(video.id, 1);
    assert_eq!(video.path, "/movies/kept.mp4");
    assert_eq!(video.created_at, 30);
    assert_eq!((video.file_size, video.modified_at), (10, 20));
    assert!(video.media_complete && video.favorite);
    assert_eq!(video.duration_ms, Some(500));
    assert_eq!((video.width, video.height), (Some(160), Some(90)));
    assert_eq!(video.codec.as_deref(), Some("h264"));
    assert_eq!(video.thumbnail_path.as_deref(), Some("cached.jpg"));
    assert_eq!((video.play_count, video.last_played_at), (3, Some(7)));
    assert_eq!(repository.directories(space_id).unwrap(), vec!["/movies"]);
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
    let repository = Repository::open(&db, "First").unwrap();
    let space = repository.current_space().unwrap();
    assert_eq!(space.name, "First");
    assert!(repository.list(space.id).unwrap().is_empty());
    assert!(repository.directories(space.id).unwrap().is_empty());
    repository.add_directory(space.id, "saved").unwrap();
    drop(repository);
    let repository = Repository::open(&db, "Ignored").unwrap();
    let space = repository.current_space().unwrap();
    assert_eq!(repository.directories(space.id).unwrap(), vec!["saved"]);
}

#[test]
fn a_version_4_database_becomes_the_first_space_and_keeps_everything_it_held() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_legacy_library(&database, &[], 4);
    // The name is not the repository's to choose: it is told one, because only
    // the caller knows the language the person upgrading is reading.
    let repository = Repository::open(&database, "默认空间").unwrap();
    let space = repository.current_space().unwrap();
    assert_eq!(space.name, "默认空间");
    assert_eq!(space.id, 1);
    assert_library_survived(&repository, space.id);
    assert_eq!(version_of(&database), 5);
    drop(repository);
    // Opening it again finds the current version and touches nothing.
    let repository = Repository::open(&database, "Ignored").unwrap();
    let space = repository.current_space().unwrap();
    assert_eq!(space.name, "默认空间");
    assert_eq!(repository.list(space.id).unwrap()[0].play_count, 3);
}

#[test]
fn a_version_3_database_is_carried_forward_and_loses_the_hash_column() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_legacy_library(&database, &["file_md5"], 3);
    let repository = Repository::open(&database, "First").unwrap();
    let space = repository.current_space().unwrap();
    assert_library_survived(&repository, space.id);
    assert_eq!(version_of(&database), 5);
    assert!(!column_present(&database, "videos", "file_md5"));
}

#[test]
fn a_version_2_database_is_carried_forward_and_loses_both_legacy_columns() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_legacy_library(&database, &["file_md5", "available"], 2);
    let repository = Repository::open(&database, "First").unwrap();
    let space = repository.current_space().unwrap();
    assert_library_survived(&repository, space.id);
    assert_eq!(version_of(&database), 5);
    assert!(!column_present(&database, "videos", "file_md5"));
    assert!(!column_present(&database, "videos", "available"));
}

#[test]
fn a_database_whose_version_lags_behind_its_columns_still_opens() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    // Version 3, but the hash column it should have is already gone. The
    // upgrade copies named columns rather than asking what the old table
    // carried, so a database in this state opens like any other.
    write_legacy_library(&database, &[], 3);
    let repository = Repository::open(&database, "First").unwrap();
    let space = repository.current_space().unwrap();
    assert_library_survived(&repository, space.id);
    assert_eq!(version_of(&database), 5);
}

#[test]
fn a_rebuilt_database_keeps_writes_made_after_the_upgrade() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_legacy_library(&database, &["file_md5"], 3);
    let repository = Repository::open(&database, "First").unwrap();
    let space = repository.current_space().unwrap();
    repository
        .favorite(space.id, "/movies/kept.mp4", false)
        .unwrap();
    drop(repository);
    let repository = Repository::open(&database, "Ignored").unwrap();
    let space = repository.current_space().unwrap();
    // The rebuild is what could have lost them; a second open must find the
    // write made after it, on the row the first open carried across.
    let rows = repository.list(space.id).unwrap();
    assert_eq!(rows.len(), 1);
    assert!(!rows[0].favorite);
    assert_eq!(rows[0].play_count, 3);
}
