#[cfg(test)]
mod tests;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::media::Metadata;
use crate::model::{ScannedFile, VideoFile};

#[derive(Clone, Default, Debug, Serialize)]
pub struct IndexChanges {
    pub added: usize,
    pub updated: usize,
    pub unavailable: usize,
}

pub struct Repository {
    connection: Connection,
}

impl Repository {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
                file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL,
                duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
                thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                available INTEGER NOT NULL DEFAULT 1, play_count INTEGER NOT NULL DEFAULT 0,
                last_played_at INTEGER,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE IF NOT EXISTS directories (path TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS directory_videos (
                directory_path TEXT REFERENCES directories(path) ON DELETE CASCADE,
                video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
                PRIMARY KEY(directory_path, video_id));",
        )?;
        Ok(Self { connection })
    }

    pub fn index(
        &mut self,
        directory: &str,
        files: &[ScannedFile],
    ) -> Result<IndexChanges, AppError> {
        let tx = self.connection.transaction()?;
        let mut changes = IndexChanges::default();
        tx.execute(
            "INSERT OR IGNORE INTO directories(path) VALUES (?1)",
            [directory],
        )?;
        tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS scan_paths(path TEXT PRIMARY KEY); DELETE FROM scan_paths;")?;
        for file in files {
            let previous = tx
                .query_row(
                    "SELECT file_size,modified_at,available FROM videos WHERE path=?1",
                    [&file.path],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, bool>(2)?,
                        ))
                    },
                )
                .optional()?;
            match previous {
                None => changes.added += 1,
                Some((size, modified, available))
                    if size != file.file_size || modified != file.modified_at || !available =>
                {
                    changes.updated += 1
                }
                _ => {}
            }
            tx.execute(
                "INSERT OR IGNORE INTO scan_paths(path) VALUES (?1)",
                [&file.path],
            )?;
            tx.execute(
                "INSERT INTO videos(path,file_name,folder_path,file_size,modified_at,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?6)
                 ON CONFLICT(path) DO UPDATE SET
                    available=1, file_name=excluded.file_name, folder_path=excluded.folder_path,
                    duration_ms=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at THEN NULL ELSE videos.duration_ms END,
                    width=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at THEN NULL ELSE videos.width END,
                    height=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at THEN NULL ELSE videos.height END,
                    codec=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at THEN NULL ELSE videos.codec END,
                    thumbnail_path=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at THEN NULL ELSE videos.thumbnail_path END,
                    updated_at=CASE WHEN videos.file_size!=excluded.file_size OR videos.modified_at!=excluded.modified_at OR videos.available=0 THEN excluded.updated_at ELSE videos.updated_at END,
                    file_size=excluded.file_size, modified_at=excluded.modified_at",
                params![file.path, file.file_name, file.folder_path, file.file_size, file.modified_at, now()],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO directory_videos(directory_path,video_id)
                 SELECT ?1,id FROM videos WHERE path=?2",
                params![directory, file.path],
            )?;
        }
        changes.unavailable = tx.execute(
            "UPDATE videos SET available=0,updated_at=?2 WHERE available=1 AND id IN
             (SELECT video_id FROM directory_videos WHERE directory_path=?1)
             AND path NOT IN (SELECT path FROM scan_paths)",
            params![directory, now()],
        )?;
        tx.commit()?;
        Ok(changes)
    }

    pub fn list(&self) -> Result<Vec<VideoFile>, AppError> {
        let mut query = self.connection.prepare("SELECT id,path,file_name,folder_path,file_size,modified_at,duration_ms,width,height,codec,thumbnail_path,favorite,available,play_count,last_played_at,created_at,updated_at FROM videos ORDER BY created_at DESC,id DESC")?;
        let rows = query.query_map([], |row| {
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
                available: row.get(12)?,
                play_count: row.get(13)?,
                last_played_at: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
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

    pub fn save_thumbnail(&self, video: &VideoFile, path: &str) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE videos SET thumbnail_path=?4 WHERE id=?1 AND file_size=?2 AND modified_at=?3",
            params![video.id, video.file_size, video.modified_at, path],
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
