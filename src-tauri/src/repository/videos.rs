//! One record, as the interface and the media pass see it: the library the
//! interface draws, the facts the media pass writes back, and the two questions
//! a caller asks about a path.
//!
//! Every write here carries 文件身份 as a condition of its own (ADR 0004): the
//! statement lands only while the record still describes the file the media were
//! read from. That is what makes a write from stale media impossible rather than
//! unlikely, and it is why the writes take the stamp as an argument instead of
//! looking it up — the stamp the caller holds is the one its media came from.
//!
//! The condition is spelled out in each statement rather than shared as a
//! fragment, because the statements key on different columns: a record is
//! written by `id` once the caller holds it, and by `path` when the caller is
//! looking the file up. A fragment shared across them would have to be read
//! against a positional parameter list, which is worse to maintain than four
//! conditions that agree with each other on the page.
//!
//! Two of the writes cannot fail for want of a record — they update one no scan
//! will have taken away underneath them, because the identity guard fails first
//! — while the two the interface drives report a record that is not there. That
//! verdict has one home: [`not_indexed`].

use rusqlite::{params, OptionalExtension};

use crate::error::AppError;
use crate::media::Metadata;
use crate::model::{FileStamp, VideoFile};

use super::{not_indexed, now, Repository};

impl Repository {
    /// The library the interface shows: every record of one space, newest first.
    pub fn list(&self, space_id: i64) -> Result<Vec<VideoFile>, AppError> {
        let mut query = self.connection.prepare("SELECT id,path,file_name,folder_path,file_size,modified_at,duration_ms,width,height,codec,thumbnail_path,favorite,play_count,last_played_at,created_at,updated_at,media_complete FROM videos WHERE space_id=?1 ORDER BY created_at DESC,id DESC")?;
        let rows = query.query_map([space_id], |row| {
            Ok(VideoFile {
                id: row.get(0)?,
                path: row.get(1)?,
                file_name: row.get(2)?,
                folder_path: row.get(3)?,
                file_size: row.get(4)?,
                modified_at: row.get(5)?,
                duration_ms: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                codec: row.get(9)?,
                thumbnail_path: row.get(10)?,
                favorite: row.get(11)?,
                play_count: row.get(12)?,
                last_played_at: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
                media_complete: row.get(16)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// The identity the space holds for a path, if it holds one.
    ///
    /// The lookup behind both questions about a path: what a refresh compares
    /// against, and whether the space knows the path at all.
    pub fn find_file_stamp(
        &self,
        space_id: i64,
        path: &str,
    ) -> Result<Option<FileStamp>, AppError> {
        self.connection
            .query_row(
                "SELECT file_size, modified_at FROM videos WHERE space_id=?1 AND path=?2",
                params![space_id, path],
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

    /// Refuses a path this space holds no record for.
    ///
    /// Asked before the player is opened on a file, so that a path the library
    /// does not know is reported rather than opened and then failed to record.
    pub fn require_indexed(&self, space_id: i64, path: &str) -> Result<(), AppError> {
        self.find_file_stamp(space_id, path)?
            .map(|_| ())
            .ok_or_else(not_indexed)
    }

    /// Writes what the media tools read about a file onto its record, only while
    /// the record still describes that file.
    pub fn save_metadata(
        &self,
        space_id: i64,
        video: &VideoFile,
        metadata: &Metadata,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET duration_ms=?5,width=?6,height=?7,codec=?8
             WHERE id=?1 AND space_id=?2 AND file_size=?3 AND modified_at=?4",
            params![
                video.id,
                space_id,
                video.file_size,
                video.modified_at,
                metadata.duration_ms,
                metadata.width,
                metadata.height,
                metadata.codec
            ],
        )?;
        Ok(())
    }

    /// Writes the metadata read for one path, and the identity they were read
    /// from, only while the record still carries the identity the caller
    /// compared against. Answers whether the write landed.
    pub fn refresh_metadata(
        &self,
        space_id: i64,
        path: &str,
        expected: FileStamp,
        updated: FileStamp,
        metadata: &Metadata,
    ) -> Result<bool, AppError> {
        let count = self.connection.execute(
            "UPDATE videos SET file_size=?5, modified_at=?6, duration_ms=?7, width=?8, height=?9, codec=?10,
                media_complete=CASE WHEN ?8 IS NOT NULL AND thumbnail_path IS NOT NULL THEN 1 ELSE 0 END,
                updated_at=?11
             WHERE space_id=?1 AND path=?2 AND file_size=?3 AND modified_at=?4",
            params![
                space_id,
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

    /// Points the record at the frame that was made for it, only while the
    /// record still describes the file the frame was made from.
    pub fn save_thumbnail(
        &self,
        space_id: i64,
        video: &VideoFile,
        path: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET thumbnail_path=?5 WHERE id=?1 AND space_id=?2 AND file_size=?3 AND modified_at=?4",
            params![video.id, space_id, video.file_size, video.modified_at, path],
        )?;
        Ok(())
    }

    /// Marks a record 媒体处理完成, which is what the scan's pass asks for when it
    /// has finished with a file.
    ///
    /// The statement decides it, not the caller: it lands only when both the
    /// facts and the frame are already stored against this file identity, so a
    /// file whose facts never arrived simply stays unfinished. A single-file
    /// refresh reaches the same verdict from its own statement
    /// ([`Repository::refresh_metadata`]), which is therefore the other half of
    /// the rule rather than a second rule — both ask for the facts and the frame
    /// on one identity and nothing else.
    pub fn complete_media(&self, space_id: i64, video: &VideoFile) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET media_complete=1 WHERE id=?1 AND space_id=?2 AND path=?3 AND file_size=?4 AND modified_at=?5
             AND width IS NOT NULL AND thumbnail_path IS NOT NULL",
            params![
                video.id,
                space_id,
                video.path,
                video.file_size,
                video.modified_at
            ],
        )?;
        Ok(())
    }

    /// Drops a record the user asked to forget. The file on disk is not this
    /// application's to touch.
    pub fn remove(&self, space_id: i64, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "DELETE FROM videos WHERE space_id=?1 AND path=?2",
            params![space_id, path],
        )?;
        Ok(())
    }

    pub fn favorite(&self, space_id: i64, path: &str, favorite: bool) -> Result<(), AppError> {
        let count = self.connection.execute(
            "UPDATE videos SET favorite=?3,updated_at=?4 WHERE space_id=?1 AND path=?2",
            params![space_id, path, favorite, now()],
        )?;
        self.require_row(count)
    }

    pub fn record_play(&self, space_id: i64, path: &str) -> Result<(), AppError> {
        let count = self.connection.execute("UPDATE videos SET play_count=play_count+1,last_played_at=?3,updated_at=?3 WHERE space_id=?1 AND path=?2", params![space_id, path, now()])?;
        self.require_row(count)
    }

    /// The same verdict as [`Repository::require_indexed`], reached from the
    /// write: a statement that matched no row found no record to act on.
    fn require_row(&self, count: usize) -> Result<(), AppError> {
        if count == 0 {
            return Err(not_indexed());
        }
        Ok(())
    }
}
