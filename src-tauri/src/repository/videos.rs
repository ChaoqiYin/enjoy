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
//! — while the three addressed by path alone report a record that is not there.
//! That verdict has one home: [`not_indexed`].

use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, OptionalExtension, Row};

use crate::error::AppError;
use crate::media::Metadata;
use crate::model::{FileStamp, VideoFile, VideoFilter, VideoPage, VideoQuery, VideoSort};

use super::{not_indexed, now, Repository};

/// The columns a record is read from, in the order [`video_row`] reads them.
const COLUMNS: &str = "id,path,file_name,folder_path,file_size,modified_at,duration_ms,width,height,codec,thumbnail_path,favorite,shared,play_count,last_played_at,created_at,updated_at,media_complete";

/// One record, off a row the [`COLUMNS`] above were selected in.
fn video_row(row: &Row<'_>) -> rusqlite::Result<VideoFile> {
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
        shared: row.get(12)?,
        play_count: row.get(13)?,
        last_played_at: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        media_complete: row.get(17)?,
    })
}

/// The conditions a query reads under, and the values they are bound with, in
/// the order the placeholders appear in the sentence.
///
/// One sentence for both of the two reads a page costs — the records and the
/// count — so that the two cannot come to mean different things: a count taken
/// under conditions of its own would report a number of pages the records then
/// do not fill.
fn conditions(query: &VideoQuery) -> (String, Vec<Value>) {
    let mut clauses = vec!["space_id = ?".to_string()];
    let mut values = vec![Value::Integer(query.space_id)];
    if let Some(search) = &query.search {
        clauses.push("file_name LIKE ? ESCAPE '\\'".into());
        values.push(Value::Text(format!("%{}%", literal(search))));
    }
    if let Some(folder) = &query.folder {
        clauses.push("folder_path = ?".into());
        values.push(Value::Text(folder.clone()));
    }
    // The three columns a page is about, each read as the mark it is: a boolean
    // the schema stores as 0 or 1, and the count of plays a record has. Played is
    // read from the count rather than from the last time, because a record that
    // was played is one that has a history, however long ago.
    match query.only {
        Some(VideoFilter::Favorite) => clauses.push("favorite = 1".into()),
        Some(VideoFilter::Shared) => clauses.push("shared = 1".into()),
        Some(VideoFilter::Played) => clauses.push("play_count > 0".into()),
        None => {}
    }
    (clauses.join(" AND "), values)
}

/// What a search looks for, as the query language reads it.
///
/// The three characters the language gives a meaning to are given back theirs:
/// a user typing `50%` is looking for a name with a percent sign in it, and one
/// whose search was matched as a pattern would be shown records that are not
/// what they asked for. The backslash goes first because it is the one that
/// makes the other two literal.
fn literal(search: &str) -> String {
    search
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// The order a query is read in, as the tail of an `ORDER BY`.
///
/// `id` is the tie-break in the same direction as the column, which is what
/// makes the order total: without it, two records that share a stamp could be
/// read twice on one page and never on the next. It is also what a page can
/// carry over from the one before it.
fn order(query: &VideoQuery) -> String {
    let sort = query.sort.unwrap_or(VideoSort::Added);
    let direction = query.direction.unwrap_or_else(|| sort.direction());
    format!(
        "{} {}, id {}",
        sort.column(),
        direction.sql(),
        direction.sql()
    )
}

impl Repository {
    /// One page of a space's records, and how many the same question holds.
    ///
    /// The count is read rather than worked out from the page, because the page
    /// is the one thing that cannot say how many there are: it is the records
    /// the interface does not have.
    pub fn list(&self, query: &VideoQuery) -> Result<VideoPage, AppError> {
        let (where_clause, values) = conditions(query);
        let total = self.connection.query_row(
            &format!("SELECT COUNT(*) FROM videos WHERE {where_clause}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )?;
        let sql = format!(
            "SELECT {COLUMNS} FROM videos WHERE {where_clause} ORDER BY {} LIMIT ? OFFSET ?",
            order(query)
        );
        let mut statement = self.connection.prepare(&sql)?;
        // Both are clamped rather than handed over as they came. A negative
        // limit is not an empty page to the query language — it is the whole
        // library — so a number that arrived out of range has to be read as the
        // page it was nearest to instead of as the one thing nobody asked for.
        let page = values
            .iter()
            .cloned()
            .chain([query.limit, query.offset].map(|bound| Value::Integer(bound.max(0))));
        let rows = statement.query_map(params_from_iter(page), video_row)?;
        let items = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(VideoPage { items, total })
    }

    /// Every record of one space, newest first.
    ///
    /// Not a page and not the interface's: it is what a pass walks — the media
    /// pass is handed every record that is not 媒体处理完成, and a list of what it
    /// has still to do cannot be asked for one page at a time. The interface
    /// reads the library through [`Repository::list`], which is the question a
    /// user asks; this is the question the application asks about its own work.
    pub fn records(&self, space_id: i64) -> Result<Vec<VideoFile>, AppError> {
        let mut query = self.connection.prepare(&format!(
            "SELECT {COLUMNS} FROM videos WHERE space_id=?1 ORDER BY created_at DESC, id DESC"
        ))?;
        let rows = query.query_map([space_id], video_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// One space's 共享清单: the paths of the records on it, in path order.
    ///
    /// Ordered by path because the 虚拟文件名 are handed out in this order — the
    /// first file to want a name gets it, and the next one to want the same name
    /// gets a number. A list order that was not the list's own would make the
    /// names depend on something the user cannot see: numbering by when each
    /// video was added would shift every later number the moment one was
    /// inserted in the middle, and the television would show a different set of
    /// names for no reason.
    pub fn shared_paths(&self, space_id: i64) -> Result<Vec<String>, AppError> {
        let mut query = self
            .connection
            .prepare("SELECT path FROM videos WHERE space_id=?1 AND shared=1 ORDER BY path")?;
        let rows = query.query_map([space_id], |row| row.get(0))?;
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

    /// Puts a record on the space's 共享清单, or takes it off.
    ///
    /// The same statement as [`Repository::favorite`] against the column beside
    /// it, down to the verdict: a path this space holds no record for is refused
    /// rather than silently done nothing about. The two are kept apart rather
    /// than folded into one write that takes a column name, because the columns
    /// mean different things — one is a mark the user leaves on a video, the
    /// other is what the share service offers to other devices — and a caller
    /// that could pass either name could pass the wrong one.
    pub fn share(&self, space_id: i64, path: &str, shared: bool) -> Result<(), AppError> {
        let count = self.connection.execute(
            "UPDATE videos SET shared=?3,updated_at=?4 WHERE space_id=?1 AND path=?2",
            params![space_id, path, shared, now()],
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
