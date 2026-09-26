use rusqlite::{params, Connection};

use crate::error::AppError;

use super::now;

/// The schema this build writes.
pub(crate) const VERSION: i64 = 5;

/// The one description of the shape, used for two jobs: creating a database
/// from nothing, and laying down the new tables during a migration. The
/// migration renames the old tables out of the way first, so this text is the
/// only place the shape is written down.
///
/// A path is no longer unique on its own. It belongs to a space, and the same
/// path may be configured in more than one, so `videos` is unique on the pair
/// and `directories` is keyed by it. `directory_videos` carries the space too,
/// because `directory_path` alone no longer names a directory (ADR 0011).
///
/// The name index folds case, and folds no more than ASCII: two spaces called
/// `Movies` and `movies` are the same name, while a name in a script that has
/// no case is compared as written.
pub(crate) const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS spaces (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL,
        current INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS spaces_name ON spaces(name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        path TEXT NOT NULL, file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
        file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL,
        media_complete INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
        thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
        play_count INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(space_id, path));
    CREATE TABLE IF NOT EXISTS directories (
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        PRIMARY KEY(space_id, path));
    CREATE TABLE IF NOT EXISTS directory_videos (
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        directory_path TEXT NOT NULL,
        video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
        PRIMARY KEY(space_id, directory_path, video_id),
        FOREIGN KEY(space_id, directory_path)
            REFERENCES directories(space_id, path) ON DELETE CASCADE);
";

/// A record's own columns, in the order a migration copies them. `space_id` is
/// absent on purpose: the old shape had no counterpart for it, so the copy
/// supplies it.
const VIDEO_COLUMNS: &str = "id,path,file_name,folder_path,file_size,modified_at,\
media_complete,duration_ms,width,height,codec,thumbnail_path,favorite,play_count,\
last_played_at,created_at,updated_at";

/// Brings a database of any version to the current one, in place.
///
/// Version 4 and older kept one directory set, one index and one set of
/// favorites for the whole application. All of it becomes the first space. Its
/// name is chosen here, once, from the interface language in force at the
/// moment of the upgrade — the person reading it is looking at that language
/// now — and is an ordinary name from then on, free to change.
pub(crate) fn migrate(
    tx: &Connection,
    version: i64,
    first_space_name: &str,
) -> Result<(), AppError> {
    if version < 2 {
        // Version 1 and older are not carried over: their shape predates the
        // index this application keeps, and nothing in them is worth reading.
        tx.execute_batch(
            "DROP TABLE IF EXISTS directory_videos; DROP TABLE IF EXISTS videos;
             DROP TABLE IF EXISTS directories; DROP TABLE IF EXISTS spaces;",
        )?;
    }
    if (2..VERSION).contains(&version) {
        // Renamed aside rather than altered. The constraints a path used to
        // carry — unique on its own, and the primary key of its directory —
        // are written into the CREATE TABLE that declared them, and SQLite
        // cannot change those in place. The rows come back below, once the new
        // shape is down. This is the first migration here that rebuilds rather
        // than drops a column (ADR 0011).
        tx.execute_batch(
            "ALTER TABLE videos RENAME TO videos_v4;
             ALTER TABLE directories RENAME TO directories_v4;
             ALTER TABLE directory_videos RENAME TO directory_videos_v4;",
        )?;
    }
    tx.execute_batch(SCHEMA)?;
    if version < VERSION {
        tx.execute(
            "INSERT INTO spaces(name,created_at,current) VALUES (?1,?2,1)",
            params![first_space_name, now()],
        )?;
        let space_id = tx.last_insert_rowid();
        if version >= 2 {
            adopt_legacy_rows(tx, space_id)?;
        }
    }
    Ok(())
}

/// Copies what version 4 and older held into the shape the current version
/// uses, all of it under the first space, then drops the tables it came from.
///
/// The copy is faithful, and it runs with foreign keys off because the
/// transaction cannot have them on. That means a legacy database already
/// carrying a membership row pointing at a record it does not have keeps that
/// row exactly as it was. It cannot gain one here: both sides of the
/// relationship are copied as they were, so the pairs that existed still do and
/// no new pair appears.
fn adopt_legacy_rows(tx: &Connection, space_id: i64) -> Result<(), AppError> {
    tx.execute_batch(&format!(
        "INSERT INTO videos (space_id,{VIDEO_COLUMNS})
         SELECT {space_id},{VIDEO_COLUMNS} FROM videos_v4;
         INSERT INTO directories (space_id,path)
         SELECT {space_id},path FROM directories_v4;
         INSERT INTO directory_videos (space_id,directory_path,video_id)
         SELECT {space_id},directory_path,video_id FROM directory_videos_v4;
         DROP TABLE directory_videos_v4;
         DROP TABLE directories_v4;
         DROP TABLE videos_v4;"
    ))?;
    Ok(())
}
