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
export const SCHEMA_VERSION = 2

/** Name of the space a fresh library opens with. */
export const DEFAULT_SPACE_NAME = '默认空间'

/**
 * `tasks` is deliberately absent: the first cordis version has no queue yet.
 * `videos` carries everything a later list needs, so the scan task can fill
 * rows without another migration.
 *
 * This is version 1 as it was first written; version 2 below adds the shared
 * mark. Keeping the historical shape here lets a version 1 file be brought
 * forward by replaying the steps it is missing.
 */
const SCHEMA_V1 = `
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

/**
 * One forward step, in order. A file behind the build replays only the steps
 * it is missing, so an existing library is altered in place rather than being
 * rebuilt from the current `CREATE TABLE` text.
 */
const MIGRATIONS: readonly { version: number; run(db: DatabaseSync): void }[] = [
  {
    version: 1,
    run(db) {
      db.exec(SCHEMA_V1)
      db.prepare(
        `INSERT INTO spaces (name, created_at, current)
         SELECT ?, ?, 1
         WHERE NOT EXISTS (SELECT 1 FROM spaces)`,
      ).run(DEFAULT_SPACE_NAME, Date.now())
    },
  },
  {
    version: 2,
    run(db) {
      db.exec(`
        ALTER TABLE videos ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS videos_by_shared ON videos(space_id, shared);
      `)
    },
  },
]

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

/**
 * Run `body` in one short transaction: all of it lands or none of it does.
 *
 * The scan worker (#112) writes to the same file, so a write is kept as brief
 * as it can be: the transaction is opened here, the statements run, and the
 * connection is free again before the next request arrives.
 */
export function inTransaction<T>(db: DatabaseSync, body: () => T): T {
  db.exec('BEGIN')
  try {
    const result = body()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/**
 * Run `body`, replaying it a few times when SQLite says the file is busy.
 *
 * `busy_timeout` already waits for a competing writer, so reaching here means
 * that wait expired. The scan worker and the request handlers share one file;
 * a batch that lost that race can be replayed as a whole because each write is
 * a transaction. The sleep is synchronous on purpose: the callers are
 * synchronous `DatabaseSync` operations, and the pause is measured in
 * milliseconds.
 */
export function retryBusy<T>(fn: () => T, attempts = 3, delayMs = 25): T {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return fn()
    } catch (error) {
      if (attempt >= attempts || !isBusy(error)) throw error
      sleep(delayMs * attempt)
    }
  }
}

function isBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as {
    code?: unknown
    errcode?: unknown
    errstr?: unknown
    message?: unknown
  }
  if (typeof candidate.errcode === 'number') {
    const primary = candidate.errcode & 0xff
    if (primary === 5 || primary === 6) return true
  }
  const text = `${candidate.code ?? ''} ${candidate.errstr ?? ''} ${candidate.message ?? ''}`
  return /SQLITE_BUSY|SQLITE_LOCKED|database (?:table )?is locked/i.test(text)
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Bring the database to `SCHEMA_VERSION`; reopening an up-to-date file is a no-op. */
export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  let version = row.user_version
  if (version >= SCHEMA_VERSION) return

  db.exec('BEGIN')
  try {
    for (const migration of MIGRATIONS) {
      if (migration.version <= version) continue
      migration.run(db)
      version = migration.version
    }
    db.exec(`PRAGMA user_version = ${version}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
