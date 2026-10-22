//! What the plugins have written about a record: the fields a video carries,
//! who wrote each one, and the pair that makes each of them a single row.
//!
//! This is the only place a plugin's answer reaches the database. A plugin
//! never writes anything itself (User Story 35) — it returns data from a mount
//! point, the kernel decides what the answer is worth, and the answer arrives
//! here to be stored. So the write path is one method wide, and it is auditable
//! by reading it.
//!
//! A write adds and replaces; it never takes away. Two plugins answering the
//! same field are merged before they arrive — the first non-empty answer wins,
//! and the merge is the dispatch's work rather than this file's — so what lands
//! here is one value per key. What lands here stays, too: a plugin that is
//! disabled, uninstalled, or simply silent this time answers with nothing, and
//! nothing is not an instruction to delete. Content a plugin added stays until
//! someone asks for it to go (User Story 7), which is why the removal of these
//! rows is a thing the uninstall path does deliberately and not a thing a
//! refresh does on its way past.

use rusqlite::{params, OptionalExtension};

use crate::error::AppError;
use crate::model::VideoField;
use crate::plugins::mount_points::is_field_key;

use super::{not_indexed, now, Repository};

impl Repository {
    /// The id this space knows a path by, or the verdict that it knows none.
    ///
    /// Asked before the plugins are, so that a file this library does not hold
    /// never becomes a plugin call: the answer could only be about a record
    /// that does not exist, and a plugin asked about one would have to be told
    /// what to do about it.
    pub fn video_id(&self, space_id: i64, path: &str) -> Result<i64, AppError> {
        self.connection
            .query_row(
                "SELECT id FROM videos WHERE space_id=?1 AND path=?2",
                params![space_id, path],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(not_indexed)
    }

    /// Writes what the plugins answered about one record.
    ///
    /// One statement per field, all of them in one transaction: a half-written
    /// answer would show the interface a record whose fields were gathered from
    /// two different calls, which is a state no call ever produced.
    ///
    /// The statement upserts rather than inserting, and that is the primary key
    /// doing its work: one field is one row, so a second answer for a key
    /// replaces the value and the source together. Two rows for one key would
    /// leave the interface with two values and nothing in the table saying which
    /// one won.
    ///
    /// The set of keys is closed (spec #96 §9), so this is also where the
    /// kernel refuses everything outside it: a key the catalog does not carry
    /// would land under a name nothing translates and nothing draws, so it is
    /// dropped before the write, with one line of log saying whose answer it
    /// was. Refusing here rather than at the caller keeps the promise at the
    /// one place a plugin's answer reaches the table.
    pub fn save_fields(&mut self, video_id: i64, fields: &[VideoField]) -> Result<(), AppError> {
        let tx = self.connection.transaction()?;
        for field in fields {
            if !is_field_key(&field.key) {
                tracing::warn!(
                    key = %field.key,
                    video_id,
                    "A field key outside the closed set was dropped before the write"
                );
                continue;
            }
            tx.execute(
                "INSERT INTO video_fields (video_id,key,value,source_plugin,updated_at)
                 VALUES (?1,?2,?3,?4,?5)
                 ON CONFLICT(video_id,key) DO UPDATE SET
                    value=excluded.value, source_plugin=excluded.source_plugin,
                    updated_at=excluded.updated_at",
                params![video_id, field.key, field.value, field.source_plugin, now()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// The fields one record carries, in key order.
    ///
    /// Ordered by the read rather than left to the write, because the interface
    /// draws these in the order it is given them: an order that followed
    /// whichever plugin answered first would move a user's rows around while
    /// they changed nothing.
    pub fn fields(&self, video_id: i64) -> Result<Vec<VideoField>, AppError> {
        let mut query = self.connection.prepare(
            "SELECT key,value,source_plugin FROM video_fields WHERE video_id=?1 ORDER BY key",
        )?;
        let rows = query.query_map([video_id], |row| {
            Ok(VideoField {
                key: row.get(0)?,
                value: row.get(1)?,
                source_plugin: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}
