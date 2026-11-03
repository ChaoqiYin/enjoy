/**
 * SQLite connection factory and migrations.
 *
 * `node:sqlite` keeps the server portable: no native addon has to be rebuilt
 * for the host, and the same code runs from a test and from the worker.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** The schema this build writes. Migration versions start at 1. */
export const SCHEMA_VERSION = 1

/** Name of the space a fresh library opens with. */
export const DEFAULT_SPACE_NAME = '默认空间'

/**
 * `tasks` is deliberately absent: the first cordis version has no queue yet.
 * `videos` carries everything a later list needs, so the scan task can fill
 * rows without another migration.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS spaces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    current INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS spaces_name ON spaces(name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY,
    space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    codec TEXT,
    thumbnail_path TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    play_count INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(space_id, path)
  );
  CREATE INDEX IF NOT EXISTS videos_by_folder ON videos(space_id, folder_path);

  CREATE TABLE IF NOT EXISTS directories (
    id INTEGER PRIMARY KEY,
    space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    UNIQUE(space_id, path)
  );

  CREATE TABLE IF NOT EXISTS directory_videos (
    space_id INTEGER NOT NULL,
    directory_path TEXT NOT NULL,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    PRIMARY KEY (space_id, directory_path, video_id),
    FOREIGN KEY (space_id, directory_path)
      REFERENCES directories(space_id, path) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS video_fields (
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source_plugin TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (video_id, key)
  );

  CREATE TABLE IF NOT EXISTS plugin_settings (
    plugin_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_id, key)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`

/** Open a database, configure it for concurrent readers and run migrations. */
export function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

/** Bring the database to `SCHEMA_VERSION`; reopening an up-to-date file is a no-op. */
export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version >= SCHEMA_VERSION) return

  db.exec('BEGIN')
  try {
    db.exec(SCHEMA)
    db.prepare(
      `INSERT INTO spaces (name, created_at, current)
       SELECT ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM spaces)`,
    ).run(DEFAULT_SPACE_NAME, Date.now())
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
