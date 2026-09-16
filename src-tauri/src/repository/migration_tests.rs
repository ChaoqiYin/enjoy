use crate::repository::tests::Fixture;
use crate::repository::Repository;

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
    assert_eq!(version, 4);
    let columns: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('videos') WHERE name = 'available'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(columns, 0);
    let hash_column: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('videos') WHERE name = 'file_md5'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(hash_column, 0);
    drop(connection);
    // Opening it again finds the current version and touches nothing.
    let repository = Repository::open(&database).unwrap();
    assert_eq!(repository.list().unwrap()[0].play_count, 3);
}

#[test]
fn a_version_3_database_is_upgraded_in_place_and_keeps_what_it_holds() {
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
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE directories (path TEXT PRIMARY KEY);
             CREATE TABLE directory_videos (
                directory_path TEXT REFERENCES directories(path) ON DELETE CASCADE,
                video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
                PRIMARY KEY(directory_path, video_id));
             INSERT INTO directories VALUES ('/movies');
             INSERT INTO videos VALUES (1,'/movies/kept.mp4','kept.mp4','/movies',10,20,'abc',
                1,500,160,90,'h264','cached.jpg',1,3,7,30,40);
             INSERT INTO directory_videos VALUES ('/movies',1);
             PRAGMA user_version=3;",
        )
        .unwrap();
    drop(connection);
    // What the migration must not touch: the record itself, its use, the saved
    // directories and everything the media phase had already written.
    let repository = Repository::open(&database).unwrap();
    let video = repository.list().unwrap().remove(0);
    assert_eq!(video.id, 1);
    assert_eq!(video.created_at, 30);
    assert_eq!(video.file_size, 10);
    assert_eq!(video.modified_at, 20);
    assert!(video.media_complete && video.favorite);
    assert_eq!(video.duration_ms, Some(500));
    assert_eq!(video.codec.as_deref(), Some("h264"));
    assert_eq!(video.thumbnail_path.as_deref(), Some("cached.jpg"));
    assert_eq!((video.play_count, video.last_played_at), (3, Some(7)));
    assert_eq!(repository.directories().unwrap(), vec!["/movies"]);
    let connection = rusqlite::Connection::open(&database).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 4);
    let hash_column: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('videos') WHERE name = 'file_md5'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(hash_column, 0);
}
