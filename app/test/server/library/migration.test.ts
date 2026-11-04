import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { KernelContext } from 'cordis-app/server'
import { openDatabase, SCHEMA_VERSION } from '../../../server/library/db.ts'
import { installLibrary } from '../../../server/library/index.ts'
import { startHarness } from './test-harness.ts'

test('a version 1 database gains the shared column and index without losing records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-migration-v1-'))
  const path = join(dir, 'library.db')
  try {
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE spaces (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL,
        created_at INTEGER NOT NULL, current INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE videos (
        id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL,
        path TEXT NOT NULL, file_name TEXT NOT NULL, folder_path TEXT NOT NULL,
        file_size INTEGER NOT NULL, modified_at INTEGER NOT NULL,
        duration_ms INTEGER, width INTEGER, height INTEGER, codec TEXT,
        thumbnail_path TEXT, favorite INTEGER NOT NULL DEFAULT 0,
        play_count INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(space_id, path)
      );
      INSERT INTO spaces (id, name, created_at, current) VALUES (1, '默认空间', 1, 1);
      INSERT INTO videos (
        space_id, path, file_name, folder_path, file_size, modified_at,
        favorite, created_at, updated_at
      ) VALUES (1, '/media/old.mkv', 'old.mkv', '/media', 10, 20, 1, 30, 30);
      PRAGMA user_version = 1;
    `)
    legacy.close()

    const db = openDatabase(path)
    try {
      const columns = db.prepare("PRAGMA table_info('videos')").all() as {
        name: string
        dflt_value: string | null
      }[]
      const shared = columns.find((column) => column.name === 'shared')
      assert.ok(shared, 'the shared column is added')
      assert.equal(shared.dflt_value, '0')
      assert.deepEqual(
        { ...(db.prepare('SELECT path, favorite, shared FROM videos').get() as object) },
        {
          path: '/media/old.mkv',
          favorite: 1,
          shared: 0,
        },
      )
      const indexes = db.prepare("PRAGMA index_list('videos')").all() as { name: string }[]
      assert.ok(indexes.some((index) => index.name === 'videos_by_shared'))
      const indexed = db.prepare("PRAGMA index_info('videos_by_shared')").all() as {
        name: string
      }[]
      assert.deepEqual(
        indexed.map((column) => column.name),
        ['space_id', 'shared'],
      )
      assert.equal(
        (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
        SCHEMA_VERSION,
      )
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reopening the same database keeps the migration idempotent', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-migration-'))
  try {
    for (let round = 0; round < 2; round += 1) {
      const harness = await startHarness((ctx) => {
        installLibrary(ctx as unknown as KernelContext, {
          dataDir,
          isScanActive: () => false,
        })
      })
      try {
        const response = await harness.request('GET', '/api/spaces')
        assert.deepEqual(response.body, {
          spaces: [{ id: 1, name: '默认空间', current: true }],
        })
      } finally {
        await harness.close()
      }
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('the connection configures WAL, busy_timeout and schema version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-config-'))
  try {
    const db = openDatabase(join(dir, 'library.db'))
    try {
      assert.equal((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal')
      assert.equal((db.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout, 5000)
      assert.equal(
        (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
        SCHEMA_VERSION,
      )
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
