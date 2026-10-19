//! The three upgrades that each add one table and touch no row: version 7
//! brought `video_fields`, version 8 `plugin_settings`, version 9 `tasks`.
//!
//! They live apart from the older upgrades because they are a family of their
//! own — the older ones rebuild `videos` and carry rows across, these only
//! ever lay a new table down — and because what such an upgrade can still get
//! wrong is always the same two things: that the library it did not touch is
//! the library it started with, and that the table it did add is usable. Each
//! test asks both, the second half by writing into the new table directly
//! rather than through the repository: a write through the repository would
//! pass against a table only the repository knew about.

use std::path::Path;

use crate::repository::fixture::Fixture;
use crate::repository::Repository;

use super::migration_tests::{column_present, version_of, write_version_5_library};

/// Writes the shape version 6 shipped: what version 5 had, plus the `shared`
/// column the version between them gained.
///
/// Written as a change on top of the version-5 shape rather than as a third copy
/// of the same SQL, because one column *is* the whole difference between the two
/// versions — and a test that spelled the tables out again could disagree with
/// `write_version_5_library` about the rest of them without anyone noticing.
/// One record carries the mark, so the upgrade has something to carry across.
fn write_version_6_library(database: &Path) {
    write_version_5_library(database);
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .execute_batch(
            "ALTER TABLE videos ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
             UPDATE videos SET shared=1 WHERE id=1;
             PRAGMA user_version=6;",
        )
        .unwrap();
}

/// Writes the shape version 7 shipped: what version 6 had, plus the
/// `video_fields` table the version between them gained.
///
/// A change on top of the version-6 shape rather than a fourth copy of the same
/// SQL, for the reason `write_version_6_library` gives: one table is the whole
/// difference between the two versions, and a copy could disagree with its
/// neighbour about the rest of them without anyone noticing.
fn write_version_7_library(database: &Path) {
    write_version_6_library(database);
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE video_fields (
                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                key TEXT NOT NULL, value TEXT NOT NULL,
                source_plugin TEXT NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY (video_id, key));
             INSERT INTO video_fields VALUES (1,'cover','/covers/1.jpg','cover-fetcher',99);
             PRAGMA user_version=7;",
        )
        .unwrap();
}

/// Writes the shape version 8 shipped: what version 7 had, plus the
/// `plugin_settings` table the version between them gained.
///
/// A change on top of the version-7 shape rather than a fifth copy of the same
/// SQL, for the reason `write_version_7_library` gives: one table is the whole
/// difference between the two versions.
fn write_version_8_library(database: &Path) {
    write_version_7_library(database);
    let connection = rusqlite::Connection::open(database).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE plugin_settings (
                plugin_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (plugin_id, key));
             INSERT INTO plugin_settings VALUES ('cover-fetcher','url','https://a.example',99);
             PRAGMA user_version=8;",
        )
        .unwrap();
}

/// The upgrade that adds a table and nothing else.
///
/// Version 7 brings `video_fields` and moves no table aside: there is no column
/// to add to a table that already exists, and the rows that are there stay
/// exactly as they were. What such an upgrade can still get wrong is the two
/// things this asks — that the library it did not touch is the library it
/// started with, and that the table it did add is usable — so the field written
/// below is the half a test that only counted records would not see.
#[test]
fn a_version_6_database_keeps_its_library_and_gains_the_field_table() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_version_6_library(&database);
    // Nothing is named: this library already has its spaces, and the upgrade
    // creates none.
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);

    // The records are in the spaces they were in, with the marks they had. Two
    // spaces holding the same path as two different records is what tells an
    // upgrade that carried them across from one that reached for a space of its
    // own — and `shared` is the column the version before this one added, so an
    // upgrade that rebuilt `videos` from the wrong shape loses it here.
    let archive = repository.current_space().unwrap();
    assert_eq!(archive.name, "Archive");
    let movies = repository
        .spaces()
        .unwrap()
        .into_iter()
        .find(|space| space.name == "Movies")
        .expect("the library kept its first space");
    let on_the_list = repository.records(movies.id).unwrap().remove(0);
    assert_eq!(on_the_list.path, "/movies/kept.mp4");
    assert!(on_the_list.shared && on_the_list.favorite);
    assert_eq!(on_the_list.thumbnail_path.as_deref(), Some("cached.jpg"));
    let other = repository.records(archive.id).unwrap().remove(0);
    assert_eq!(other.path, on_the_list.path);
    assert_ne!(other.id, on_the_list.id);
    assert!(!other.shared && !other.favorite);
    assert_eq!(other.play_count, 1);

    // The table arrived with the columns the write path is built on. Written
    // into directly rather than through the repository, because what is being
    // asked here is what the database has: a write through the repository would
    // pass against a table only the repository knew about.
    assert!(column_present(&database, "video_fields", "source_plugin"));
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute(
            "INSERT INTO video_fields (video_id,key,value,source_plugin,updated_at)
             VALUES (?1,'cover','/covers/1.jpg','cover-fetcher',99)",
            [on_the_list.id],
        )
        .unwrap();
    drop(connection);
    drop(repository);

    // Opened again: the library is the current version, the upgrade does
    // nothing a second time, and the field written in between is still there.
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);
    let connection = rusqlite::Connection::open(&database).unwrap();
    let stored: (String, String, String) = connection
        .query_row(
            "SELECT key,value,source_plugin FROM video_fields WHERE video_id=?1",
            [on_the_list.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        stored,
        (
            "cover".to_string(),
            "/covers/1.jpg".to_string(),
            "cover-fetcher".to_string()
        )
    );
    assert_eq!(repository.records(movies.id).unwrap().len(), 1);
}

/// The second upgrade that adds a table and nothing else.
///
/// Version 8 brings `plugin_settings`, which is the same kind of change version
/// 7 was: no table is moved aside, no row is touched, and the create statement in
/// [`super::schema::SCHEMA`] is the whole of it. What such an upgrade can still
/// get wrong is the same two things — that the library it did not touch is the
/// library it started with, and that the table it did add is usable — so the
/// setting written below is the half a test that only counted records would not
/// see. The field a plugin wrote before the upgrade is read back too, because the
/// one thing a migration must never do is lose what the previous version kept.
#[test]
fn a_version_7_database_keeps_its_library_and_gains_the_settings_table() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_version_7_library(&database);
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);

    let archive = repository.current_space().unwrap();
    assert_eq!(archive.name, "Archive");
    let movies = repository
        .spaces()
        .unwrap()
        .into_iter()
        .find(|space| space.name == "Movies")
        .expect("the library kept its first space");
    let kept = repository.records(movies.id).unwrap().remove(0);
    assert_eq!(kept.path, "/movies/kept.mp4");
    assert!(kept.shared && kept.favorite);
    assert_eq!(
        repository.fields(kept.id).unwrap()[0].value,
        "/covers/1.jpg",
        "the field the previous version stored is still there"
    );

    // The table arrived with the columns the write path is built on. Written
    // into directly rather than through the repository, because what is being
    // asked here is what the database has: a write through the repository would
    // pass against a table only the repository knew about.
    assert!(column_present(&database, "plugin_settings", "plugin_id"));
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute(
            "INSERT INTO plugin_settings (plugin_id,key,value,updated_at)
             VALUES ('cover-fetcher','url','https://a.example',99)",
            [],
        )
        .unwrap();
    drop(connection);
    drop(repository);

    // Opened again: the library is the current version, the upgrade does nothing
    // a second time, and the setting written in between is still there.
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);
    let settings = repository.plugin_settings("cover-fetcher").unwrap();
    assert_eq!(settings.len(), 1);
    assert_eq!(settings[0].value, "https://a.example");
    assert_eq!(repository.records(movies.id).unwrap().len(), 1);
}

/// The third upgrade that adds a table and nothing else.
///
/// Version 9 brings `tasks`, which is the same kind of change versions 7 and 8
/// were: no table is moved aside, no row is touched, and the create statement in
/// [`super::schema::SCHEMA`] is the whole of it. What such an upgrade can still
/// get wrong is the same two things — that the library it did not touch is the
/// library it started with, and that the table it did add is usable — so the
/// task enqueued below is the half a test that only counted records would not
/// see. The setting and the field kept from earlier versions are read back too,
/// because the one thing a migration must never do is lose what the previous
/// version kept.
#[test]
fn a_version_8_database_keeps_its_library_and_gains_the_task_table() {
    let fixture = Fixture::new();
    let database = fixture.0.join("library.db");
    write_version_8_library(&database);
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);

    let archive = repository.current_space().unwrap();
    assert_eq!(archive.name, "Archive");
    let movies = repository
        .spaces()
        .unwrap()
        .into_iter()
        .find(|space| space.name == "Movies")
        .expect("the library kept its first space");
    let kept = repository.records(movies.id).unwrap().remove(0);
    assert_eq!(kept.path, "/movies/kept.mp4");
    assert!(kept.shared && kept.favorite);
    assert_eq!(
        repository.fields(kept.id).unwrap()[0].value,
        "/covers/1.jpg",
        "the field the previous version stored is still there"
    );
    assert_eq!(
        repository.plugin_settings("cover-fetcher").unwrap()[0].value,
        "https://a.example",
        "the setting the previous version stored is still there"
    );

    // The table arrived with the columns the task queue is built on. Written
    // into directly rather than through the repository, because what is being
    // asked here is what the database has: a write through the repository would
    // pass against a table only the repository knew about.
    assert!(column_present(&database, "tasks", "pause_requested"));
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute(
            "INSERT INTO tasks (plugin,space_id,video_id,kind,payload,state,
                attempts,available_at,created_at,updated_at)
             VALUES (NULL,?1,?2,'scan','{}','pending',0,100,100,100)",
            [movies.id, kept.id],
        )
        .unwrap();
    drop(connection);
    drop(repository);

    // Opened again: the library is the current version, the upgrade does nothing
    // a second time, and the task written in between is still there.
    let repository = Repository::open(&database, "Ignored").unwrap();
    assert_eq!(version_of(&database), 9);
    let connection = rusqlite::Connection::open(&database).unwrap();
    let stored: (String, String) = connection
        .query_row(
            "SELECT kind,state FROM tasks WHERE space_id=?1 AND video_id=?2",
            [movies.id, kept.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(stored, ("scan".to_string(), "pending".to_string()));
    assert_eq!(repository.records(movies.id).unwrap().len(), 1);
}
