//! Bringing one space's index in line with what a scan of its configured
//! directories found: the write-back half of 增量扫描.
//!
//! Two rules live here, and both are about membership rather than about any one
//! record. A record belongs to the scan universe while one of its directories
//! accounts for it, which is what [`REMOVAL_SQL`] decides; and a directory
//! belongs to the universe while this run could read it, which is what the
//! verdict carried in from the file system ([`Found`]) decides, here and nowhere
//! else.
//!
//! The transaction is opened in `replace_videos_controlled` and every statement
//! below runs inside it: a run that fails partway leaves the index as it was
//! rather than half-synced.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppError;
use crate::model::{FileStamp, Found, ScannedFile};

use super::{now, IndexChanges, Repository};

/// What one configured directory contributed to a scan.
///
/// The verdict is carried rather than worked out here. Deciding it needs to
/// know why a read failed, which is a fact about this run and about the file
/// system; executing it needs the index. `Found` says what the directory turned
/// out to be, and this is the pair of it with the path it was read from.
pub struct DirectoryScan {
    pub path: String,
    pub found: Found,
}

/// Removes the records of one space that no longer belong to its scan universe.
///
/// A record survives when one of its directories either was not scanned this
/// run — an unreadable directory keeps its records — or was scanned and still
/// accounts for the file: the file was found there, or its path was there but
/// could not be read. A record with no membership at all is removed: removing a
/// saved directory cascades its membership rows away, so this is also what
/// clears the records of a directory the user removed, without a cascade
/// delete of its own.
///
/// The space is named here even though the two temporary tables only ever hold
/// what the current run put in them, which came from one space: the statement
/// deletes, and a delete that cannot say which space it means is one edit away
/// from clearing another space's records.
const REMOVAL_SQL: &str = "DELETE FROM videos WHERE space_id = ?1 AND NOT EXISTS (
        SELECT 1 FROM directory_videos AS membership
        WHERE membership.video_id = videos.id
          AND (membership.directory_path NOT IN (SELECT path FROM scanned_directories)
               OR videos.path IN (SELECT path FROM scan_paths)))";

impl Repository {
    /// The scan universe: every directory saved in this space.
    pub fn directories(&self, space_id: i64) -> Result<Vec<String>, AppError> {
        let mut query = self
            .connection
            .prepare("SELECT path FROM directories WHERE space_id=?1 ORDER BY path")?;
        let rows = query.query_map([space_id], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Saves a directory into the space's scan universe.
    pub fn add_directory(&self, space_id: i64, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT OR IGNORE INTO directories(space_id,path) VALUES (?1,?2)",
            params![space_id, path],
        )?;
        Ok(())
    }

    /// Takes a directory out of the scan universe. The records it accounted for
    /// go with it: the membership rows cascade, and the next scan's removal step
    /// finds them unaccounted for.
    pub fn remove_directory(&self, space_id: i64, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "DELETE FROM directories WHERE space_id=?1 AND path=?2",
            params![space_id, path],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn index(
        &mut self,
        space_id: i64,
        directory: &str,
        files: &[ScannedFile],
    ) -> Result<IndexChanges, AppError> {
        self.replace_videos(space_id, &[(directory.into(), files.to_vec())])
    }

    #[cfg(test)]
    pub fn replace_videos(
        &mut self,
        space_id: i64,
        directories: &[(String, Vec<ScannedFile>)],
    ) -> Result<IndexChanges, AppError> {
        let scans: Vec<_> = directories
            .iter()
            .map(|(path, files)| DirectoryScan {
                path: path.clone(),
                found: Found::Read {
                    files: files.clone(),
                    unreadable: Vec::new(),
                },
            })
            .collect();
        self.replace_videos_controlled(space_id, &scans, || Ok(()))
    }

    /// Syncs one space's index with what a scan of its saved directories found.
    ///
    /// `scans` reports one entry per configured directory, and the removal
    /// step is decided against those directories rather than against the
    /// entries the caller happened to pass: a directory that is missing from
    /// `scans` keeps its records just like an unreadable one. Only the space
    /// named here is touched, however the scans were gathered.
    pub fn replace_videos_controlled(
        &mut self,
        space_id: i64,
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
            let (files, unreadable): (&[ScannedFile], &[String]) = match &scan.found {
                Found::Read { files, unreadable } => (files, unreadable),
                // Nothing it held survived it: registered with no files of its
                // own, so the removal below takes every record it accounted for.
                Found::Gone => (&[], &[]),
                // A directory that could not be read says nothing about what is
                // inside it, and neither does a path that is not a directory.
                // Both are left unregistered, which is what keeps their records
                // out of the removal below.
                Found::Unreachable | Found::NotADirectory => continue,
            };
            let indexed = Self::index_files(&tx, space_id, &scan.path, files, &checkpoint)?;
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
            for path in unreadable {
                tx.execute(
                    "INSERT OR IGNORE INTO scan_paths(path)
                     SELECT path FROM videos
                     WHERE space_id = ?3 AND (path = ?1 OR substr(path, 1, length(?2)) = ?2)",
                    params![
                        path,
                        format!("{path}{}", std::path::MAIN_SEPARATOR),
                        space_id
                    ],
                )?;
            }
        }
        checkpoint()?;
        changes.removed = tx.execute(REMOVAL_SQL, [space_id])?;
        checkpoint()?;
        tx.commit()?;
        Ok(changes)
    }

    fn index_files(
        tx: &Connection,
        space_id: i64,
        directory: &str,
        files: &[ScannedFile],
        checkpoint: &impl Fn() -> Result<(), AppError>,
    ) -> Result<IndexChanges, AppError> {
        let mut changes = IndexChanges::default();
        tx.execute(
            "INSERT OR IGNORE INTO directories(space_id,path) VALUES (?1,?2)",
            params![space_id, directory],
        )?;
        tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS scan_paths(path TEXT PRIMARY KEY);")?;
        for file in files {
            checkpoint()?;
            let previous = tx
                .query_row(
                    "SELECT file_size,modified_at FROM videos WHERE space_id=?1 AND path=?2",
                    params![space_id, &file.path],
                    |row| {
                        Ok(FileStamp {
                            file_size: row.get(0)?,
                            modified_at: row.get(1)?,
                        })
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
            //
            // The comparison is the one `FileStamp` already carries: the stored
            // stamp is the identity the media were derived from, and the same
            // pair guards the writes back to the row, so the rule and the guard
            // cannot drift apart (ADR 0004). A rewrite that leaves both halves
            // untouched is not noticed, which is the blind spot ADR 0004
            // accepts.
            let stamp = FileStamp {
                file_size: file.file_size,
                modified_at: file.modified_at,
            };
            let changed = previous.is_some_and(|stored| stored != stamp);
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
                "INSERT INTO videos(space_id,path,file_name,folder_path,file_size,modified_at,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?7)
                 ON CONFLICT(space_id,path) DO UPDATE SET
                    file_name=excluded.file_name, folder_path=excluded.folder_path,
                    media_complete=CASE WHEN ?8 THEN 0 ELSE videos.media_complete END,
                    duration_ms=CASE WHEN ?8 THEN NULL ELSE videos.duration_ms END,
                    width=CASE WHEN ?8 THEN NULL ELSE videos.width END,
                    height=CASE WHEN ?8 THEN NULL ELSE videos.height END,
                    codec=CASE WHEN ?8 THEN NULL ELSE videos.codec END,
                    thumbnail_path=CASE WHEN ?8 THEN NULL ELSE videos.thumbnail_path END,
                    updated_at=CASE WHEN ?8 THEN excluded.updated_at ELSE videos.updated_at END,
                    file_size=excluded.file_size, modified_at=excluded.modified_at",
                params![space_id, file.path, file.file_name, file.folder_path, file.file_size, file.modified_at, now(), changed],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO directory_videos(space_id,directory_path,video_id)
                 SELECT ?1,?2,id FROM videos WHERE space_id=?1 AND path=?3",
                params![space_id, directory, file.path],
            )?;
        }
        Ok(changes)
    }
}
