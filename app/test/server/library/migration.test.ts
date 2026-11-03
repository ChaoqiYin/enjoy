import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { KernelContext } from 'cordis-app/server'
import { openDatabase, SCHEMA_VERSION } from '../../../server/library/db.ts'
import { installLibrary } from '../../../server/library/index.ts'
import { startHarness } from './test-harness.ts'

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
