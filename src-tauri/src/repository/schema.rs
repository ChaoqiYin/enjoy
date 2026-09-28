use rusqlite::{params, Connection};

use crate::error::AppError;

use super::now;

/// The schema this build writes.
pub(crate) const VERSION: i64 = 6;

/// The version that gave the library its spaces (ADR 0011).
///
/// Named because the upgrade path divides on it: a database older than this one
/// has no spaces at all and becomes the first one, while a database at this
/// version already has them and keeps them. Reading that boundary off `VERSION`
/// would say the opposite of what it means — `VERSION` moves, and the shape a
/// database from before spaces had does not.
const SPACES: i64 = 5;

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
///
/// `shared` is a column beside `favorite` rather than a table of its own. The
/// share list is one more thing a space says about a record it already holds, so
/// a column buys the three properties a table would have had to be told: the
/// list is per space because the record is, the mark goes when the record does,
/// and no row can point at a video that is gone.
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
        shared INTEGER NOT NULL DEFAULT 0,
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

/// A record's own columns, in the order a migration copies them.
///
/// Two columns are absent on purpose, and both absences are what makes the same
/// list serve both upgrades.
///
/// `shared` is not in either shape a migration carries forward — it arrived with
/// the version this build writes. Leaving it out of the copy is what fills it
/// in: the new table's `DEFAULT 0` applies, so every record already in a space
/// is 未加入共享清单, which is the only answer an upgrade could give.
///
/// `space_id` has no counterpart in the older shape, whose copy supplies the
/// first space's id as a literal. The version-5 shape does have one, and its
/// copy takes the column from the old table — the two differ in where the value
/// comes from, not in which columns are carried.
const VIDEO_COLUMNS: &str = "id,path,file_name,folder_path,file_size,modified_at,\
media_complete,duration_ms,width,height,codec,thumbnail_path,favorite,play_count,\
last_played_at,created_at,updated_at";

/// Brings a database of any version to the current one, in place.
///
/// Two upgrades are written here, and they are different in kind rather than in
/// degree. The older one carries a library that predates spaces into the first
/// space. Its name is chosen here, once, from the interface language in force at
/// the moment of the upgrade — the person reading it is looking at that language
/// now — and is an ordinary name from then on, free to change. The newer one
/// moves a library that already has its spaces from version 5 to 6, and creates
/// nothing: the spaces are already there, and every row keeps the `space_id` it
/// had.
///
/// Both rebuild rather than alter. SQLite can add a column in place, and this
/// file could have done that in one statement — but the shape is written down
/// once, in [`SCHEMA`], and an `ALTER` here would put a second, partial copy of
/// it in this function. The price is that a rename has to be spelled out for
/// every table, including the ones whose shape did not change.
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
    if (2..SPACES).contains(&version) {
        // Renamed aside rather than altered. The constraints a path used to
        // carry — unique on its own, and the primary key of its directory —
        // are written into the CREATE TABLE that declared them, and SQLite
        // cannot change those in place. The rows come back below, once the new
        // shape is down (ADR 0011).
        tx.execute_batch(
            "ALTER TABLE videos RENAME TO videos_v4;
             ALTER TABLE directories RENAME TO directories_v4;
             ALTER TABLE directory_videos RENAME TO directory_videos_v4;",
        )?;
    }
    if version == SPACES {
        // The version-5 shape, moved aside for one arriving column: `shared`.
        // Only `videos` gains anything, but all three are named, because a
        // rename is not a private matter between a table and itself — SQLite
        // rewrites every other table's reference to the table being renamed, so
        // moving `videos` alone would leave `directory_videos` pointing at
        // `videos_v5` and then drop it out from under it. Rebuilding all three
        // also keeps the two upgrades in this function recognisably the same
        // shape, which is what makes them readable side by side.
        tx.execute_batch(
            "ALTER TABLE videos RENAME TO videos_v5;
             ALTER TABLE directories RENAME TO directories_v5;
             ALTER TABLE directory_videos RENAME TO directory_videos_v5;",
        )?;
    }
    tx.execute_batch(SCHEMA)?;
    if version < SPACES {
        tx.execute(
            "INSERT INTO spaces(name,created_at,current) VALUES (?1,?2,1)",
            params![first_space_name, now()],
        )?;
        let space_id = tx.last_insert_rowid();
        if version >= 2 {
            adopt_pre_space_rows(tx, space_id)?;
        }
    }
    if version == SPACES {
        adopt_space_rows(tx)?;
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
///
/// The space is supplied rather than read, because the shape this comes from had
/// no column to read it from: every record in such a database belongs to the one
/// space the library is becoming.
fn adopt_pre_space_rows(tx: &Connection, space_id: i64) -> Result<(), AppError> {
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

/// Copies what version 5 held into the shape the current version uses, keeping
/// every row in the space it was already in, then drops the tables it came from.
///
/// No space is created and none is named: this is the upgrade from a library
/// that has spaces to the same library with one more column, so the rows carry
/// their own `space_id` across. Nothing is added to the copy for `shared` either
/// — the column is not in the shape being read, so the new table's `DEFAULT 0`
/// answers for every row, and the whole library upgrades as 未加入共享清单.
///
/// The same faithfulness the older copy keeps applies here, for the same reason:
/// foreign keys are off inside the migration, so a membership row pointing at a
/// record that was already missing stays exactly as it was.
fn adopt_space_rows(tx: &Connection) -> Result<(), AppError> {
    tx.execute_batch(&format!(
        "INSERT INTO videos (space_id,{VIDEO_COLUMNS})
         SELECT space_id,{VIDEO_COLUMNS} FROM videos_v5;
         INSERT INTO directories (space_id,path)
         SELECT space_id,path FROM directories_v5;
         INSERT INTO directory_videos (space_id,directory_path,video_id)
         SELECT space_id,directory_path,video_id FROM directory_videos_v5;
         DROP TABLE directory_videos_v5;
         DROP TABLE directories_v5;
         DROP TABLE videos_v5;"
    ))?;
    Ok(())
}
