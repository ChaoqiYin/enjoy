#[cfg(test)]
mod incremental_tests;
#[cfg(test)]
pub(crate) mod tests;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::media::Metadata;
use crate::model::{FileStamp, ScannedFile, VideoFile};

#[derive(Clone, Default, Debug, Serialize)]
pub struct IndexChanges {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
}

/// What one configured directory contributed to a scan.
pub struct DirectoryScan {
    pub path: String,
    /// `None` when the directory could not be read at all. Its records are then
    /// left alone: this scan says nothing about what is inside it.
    pub files: Option<Vec<ScannedFile>>,
    /// Paths under this directory that failed this run although they are still
    /// there. They are absent from `files`, so their records are kept exactly
    /// as they were rather than read as videos that disappeared.
    pub unreadable: Vec<String>,
}

/// Removes the records that no longer belong to the scan universe.
///
/// A record survives when one of its directories either was not scanned this
/// run — an unreadable directory keeps its records — or was scanned and still
/// accounts for the file: the file was found there, or its path was there but
/// could not be read. A record with no membership at all is removed: removing a
/// saved directory cascades its membership rows away, so this is also what
/// clears the records of a directory the user removed, without a cascade
/// delete of its own.
const REMOVAL_SQL: &str = "DELETE FROM videos WHERE NOT EXISTS (
        SELECT 1 FROM directory_videos AS membership
        WHERE membership.video_id = videos.id
          AND (membership.directory_path NOT IN (SELECT path FROM scanned_directories)
               OR videos.path IN (SELECT path FROM scan_paths)))";

pub struct Repository {
    connection: Connection,
}

impl Repository {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let tx = connection.transaction()?;
        if version < 2 {
            tx.execute_batch("DROP TABLE IF EXISTS directory_videos; DROP TABLE IF EXISTS videos; DROP TABLE IF EXISTS directories;")?;
        }
        tx.execute_batch(
            "
             CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
                file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL, file_md5 TEXT NOT NULL,
                media_complete INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
                thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS directories (path TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS directory_videos (
                directory_path TEXT REFERENCES directories(path) ON DELETE CASCADE,
                video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
                PRIMARY KEY(directory_path, video_id));",
        )?;
        if version == 2 {
            // Version 2 carried a `videos.available` column that no code reads
            // any more. Dropping it upgrades the database in place: rebuilding
            // the table would throw away the favorites, the play history and
            // the saved directories along with it.
            Self::drop_legacy_column(&tx, "available")?;
        }
        tx.pragma_update(None, "user_version", 3_i64)?;
        tx.commit()?;
        connection.pragma_update(None, "foreign_keys", true)?;
        Ok(Self { connection })
    }

    /// Drops a column a legacy version of the schema carried and no code reads
    /// any more, upgrading the database in place. The column is looked up
    /// first, so a database that lost it while its version number stayed behind
    /// can still be opened, and dropping a column that is already gone is a
    /// no-op rather than an error. The name is spelled out at the call site in
    /// this file -- never taken from outside it -- so it needs no quoting.
    fn drop_legacy_column(tx: &Connection, name: &str) -> Result<(), AppError> {
        let present: i64 = tx.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('videos') WHERE name = ?1",
            [name],
            |row| row.get(0),
        )?;
        if present > 0 {
            tx.execute_batch(&format!("ALTER TABLE videos DROP COLUMN {name};"))?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn index(
        &mut self,
        directory: &str,
        files: &[ScannedFile],
    ) -> Result<IndexChanges, AppError> {
        self.replace_videos(&[(directory.into(), files.to_vec())])
    }

    fn index_files(
        tx: &Connection,
        directory: &str,
        files: &[ScannedFile],
        checkpoint: &impl Fn() -> Result<(), AppError>,
    ) -> Result<IndexChanges, AppError> {
        let mut changes = IndexChanges::default();
        tx.execute(
            "INSERT OR IGNORE INTO directories(path) VALUES (?1)",
            [directory],
        )?;
        tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS scan_paths(path TEXT PRIMARY KEY);")?;
        for file in files {
            checkpoint()?;
            let previous = tx
                .query_row(
                    "SELECT file_size,modified_at,file_md5 FROM videos WHERE path=?1",
                    [&file.path],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()?;
            // Whether a file counts as changed is decided here, once, from the
            // row just read: the write below consumes that verdict as a bound
            // parameter instead of comparing the columns a second time in SQL,
            // so the rule has a single home. Deciding it in Rust and deciding it
            // inside the statement say the same thing, because the read and the
            // write run on one connection inside one transaction and nothing
            // touches this path in between: the row the statement sees is the
            // row read here. A path with no stored row is an addition rather
            // than a change -- it holds nothing of its own to invalidate -- and
            // the counters below follow the same verdict, so new and updated
            // records are counted exactly as they are written.
            let changed = match &previous {
                // The row is read whole -- it is the stored identity of the
                // file -- but the content hash is the field this rule compares.
                Some((_, _, md5)) => *md5 != file.file_md5,
                None => false,
            };
            if previous.is_none() {
                changes.added += 1;
            } else if changed {
                changes.updated += 1;
            }
            tx.execute(
                "INSERT OR IGNORE INTO scan_paths(path) VALUES (?1)",
                [&file.path],
            )?;
            tx.execute(
                "INSERT INTO videos(path,file_name,folder_path,file_size,modified_at,file_md5,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?7)
                 ON CONFLICT(path) DO UPDATE SET
                    file_name=excluded.file_name, folder_path=excluded.folder_path,
                    media_complete=CASE WHEN ?8 THEN 0 ELSE videos.media_complete END,
                    duration_ms=CASE WHEN ?8 THEN NULL ELSE videos.duration_ms END,
                    width=CASE WHEN ?8 THEN NULL ELSE videos.width END,
                    height=CASE WHEN ?8 THEN NULL ELSE videos.height END,
                    codec=CASE WHEN ?8 THEN NULL ELSE videos.codec END,
                    thumbnail_path=CASE WHEN ?8 THEN NULL ELSE videos.thumbnail_path END,
                    updated_at=CASE WHEN ?8 THEN excluded.updated_at ELSE videos.updated_at END,
                    file_size=excluded.file_size, modified_at=excluded.modified_at, file_md5=excluded.file_md5",
                params![file.path, file.file_name, file.folder_path, file.file_size, file.modified_at, file.file_md5, now(), changed],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO directory_videos(directory_path,video_id)
                 SELECT ?1,id FROM videos WHERE path=?2",
                params![directory, file.path],
            )?;
        }
        Ok(changes)
    }

    #[cfg(test)]
    pub fn replace_videos(
        &mut self,
        directories: &[(String, Vec<ScannedFile>)],
    ) -> Result<IndexChanges, AppError> {
        let scans: Vec<_> = directories
            .iter()
            .map(|(path, files)| DirectoryScan {
                path: path.clone(),
                files: Some(files.clone()),
                unreadable: Vec::new(),
            })
            .collect();
        self.replace_videos_controlled(&scans, || Ok(()))
    }

    /// Syncs the index with what a scan of the saved directories found.
    ///
    /// `scans` reports one entry per configured directory, and the removal
    /// step is decided against those directories rather than against the
    /// entries the caller happened to pass: a directory that is missing from
    /// `scans` keeps its records just like an unreadable one.
    pub fn replace_videos_controlled(
        &mut self,
        scans: &[DirectoryScan],
        checkpoint: impl Fn() -> Result<(), AppError>,
    ) -> Result<IndexChanges, AppError> {
        let tx = self.connection.transaction()?;
        checkpoint()?;
        tx.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS scan_paths(path TEXT PRIMARY KEY);
             CREATE TEMP TABLE IF NOT EXISTS scanned_directories(path TEXT PRIMARY KEY);
             DELETE FROM scan_paths;
             DELETE FROM scanned_directories;",
        )?;
        let mut changes = IndexChanges::default();
        for scan in scans {
            checkpoint()?;
            let Some(files) = &scan.files else {
                continue;
            };
            let indexed = Self::index_files(&tx, &scan.path, files, &checkpoint)?;
            changes.added += indexed.added;
            changes.updated += indexed.updated;
            tx.execute(
                "INSERT OR IGNORE INTO scanned_directories(path) VALUES (?1)",
                [&scan.path],
            )?;
            // A path that failed while still being there must not read as a
            // video that disappeared: the records under it are kept out of the
            // removal step below. Only existing records are selected, so a
            // failed path can never bring a record into being. The prefix is
            // matched with `substr` rather than `LIKE`, because a path may
            // contain the wildcards `%` and `_`. It is built with the platform's
            // own separator, because the stored paths were rendered from native
            // ones: a subtree is a prefix of its records only when it is spelled
            // the same way they are, and on Windows a `/` would match nothing.
            for path in &scan.unreadable {
                tx.execute(
                    "INSERT OR IGNORE INTO scan_paths(path)
                     SELECT path FROM videos WHERE path = ?1 OR substr(path, 1, length(?2)) = ?2",
                    params![path, format!("{path}{}", std::path::MAIN_SEPARATOR)],
                )?;
            }
        }
        checkpoint()?;
        changes.removed = tx.execute(REMOVAL_SQL, [])?;
        checkpoint()?;
        tx.commit()?;
        Ok(changes)
    }

    pub fn list(&self) -> Result<Vec<VideoFile>, AppError> {
        let mut query = self.connection.prepare("SELECT id,path,file_name,folder_path,file_size,modified_at,file_md5,duration_ms,width,height,codec,thumbnail_path,favorite,play_count,last_played_at,created_at,updated_at,media_complete FROM videos ORDER BY created_at DESC,id DESC")?;
        let rows = query.query_map([], |row| {
            Ok(VideoFile {
                id: row.get(0)?,
                path: row.get(1)?,
                file_name: row.get(2)?,
                folder_path: row.get(3)?,
                file_size: row.get(4)?,
                modified_at: row.get(5)?,
                file_md5: row.get(6)?,
                duration_ms: row.get(7)?,
                width: row.get(8)?,
                height: row.get(9)?,
                codec: row.get(10)?,
                thumbnail_path: row.get(11)?,
                favorite: row.get(12)?,
                play_count: row.get(13)?,
                last_played_at: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                media_complete: row.get(17)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save_metadata(&self, video: &VideoFile, metadata: &Metadata) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET duration_ms=?4,width=?5,height=?6,codec=?7 WHERE id=?1 AND file_size=?2 AND modified_at=?3",
            params![video.id, video.file_size, video.modified_at, metadata.duration_ms, metadata.width, metadata.height, metadata.codec])?;
        Ok(())
    }

    pub fn find_file_stamp(&self, path: &str) -> Result<Option<FileStamp>, AppError> {
        self.connection
            .query_row(
                "SELECT file_size, modified_at FROM videos WHERE path=?1",
                [path],
                |row| {
                    Ok(FileStamp {
                        file_size: row.get(0)?,
                        modified_at: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn refresh_metadata(
        &self,
        path: &str,
        expected: FileStamp,
        updated: FileStamp,
        metadata: &Metadata,
    ) -> Result<bool, AppError> {
        let count = self.connection.execute(
            "UPDATE videos SET file_size=?4, modified_at=?5, duration_ms=?6, width=?7, height=?8, codec=?9,
                media_complete=CASE WHEN ?7 IS NOT NULL AND thumbnail_path IS NOT NULL THEN 1 ELSE 0 END,
                updated_at=?10
             WHERE path=?1 AND file_size=?2 AND modified_at=?3",
            params![
                path,
                expected.file_size,
                expected.modified_at,
                updated.file_size,
                updated.modified_at,
                metadata.duration_ms,
                metadata.width,
                metadata.height,
                metadata.codec,
                now(),
            ],
        )?;
        Ok(count > 0)
    }

    pub fn save_thumbnail(&self, video: &VideoFile, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET thumbnail_path=?4 WHERE id=?1 AND file_size=?2 AND modified_at=?3",
            params![video.id, video.file_size, video.modified_at, path],
        )?;
        Ok(())
    }

    pub fn complete_media(&self, video: &VideoFile) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET media_complete=1 WHERE id=?1 AND path=?2 AND file_md5=?3
             AND width IS NOT NULL AND thumbnail_path IS NOT NULL",
            params![video.id, video.path, video.file_md5],
        )?;
        Ok(())
    }

    pub fn directories(&self) -> Result<Vec<String>, AppError> {
        let mut query = self
            .connection
            .prepare("SELECT path FROM directories ORDER BY path")?;
        let rows = query.query_map([], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn add_directory(&self, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT OR IGNORE INTO directories(path) VALUES (?1)",
            [path],
        )?;
        Ok(())
    }

    pub fn remove_directory(&self, path: &str) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM directories WHERE path=?1", [path])?;
        Ok(())
    }

    pub fn remove(&self, path: &str) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM videos WHERE path=?1", [path])?;
        Ok(())
    }

    pub fn favorite(&self, path: &str, favorite: bool) -> Result<(), AppError> {
        let count = self.connection.execute(
            "UPDATE videos SET favorite=?2,updated_at=?3 WHERE path=?1",
            params![path, favorite, now()],
        )?;
        self.require_row(count)
    }

    pub fn record_play(&self, path: &str) -> Result<(), AppError> {
        let count = self.connection.execute("UPDATE videos SET play_count=play_count+1,last_played_at=?2,updated_at=?2 WHERE path=?1", params![path, now()])?;
        self.require_row(count)
    }

    fn require_row(&self, count: usize) -> Result<(), AppError> {
        if count == 0 {
            return Err(AppError::new(
                "media.file.not_found",
                "Video is not indexed",
            ));
        }
        Ok(())
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
