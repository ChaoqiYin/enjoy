/**
 * Minimal node:sqlite smoke test.
 *
 * Verifies that the Node runtime can open a database, enable WAL, write and
 * read rows, and that WAL is still active after reopening the file. Runs
 * standalone: `node scripts/sqlite-smoke.mjs`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dir = mkdtempSync(join(tmpdir(), 'enjoy-sqlite-smoke-'))
const file = join(dir, 'smoke.db')

try {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')

  const mode = db.prepare('PRAGMA journal_mode').get()
  assert.equal(mode.journal_mode, 'wal', 'journal_mode should be wal after enabling it')

  db.exec('CREATE TABLE videos (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
  const insert = db.prepare('INSERT INTO videos (name) VALUES (?)')
  assert.equal(insert.run('alpha').changes, 1)
  assert.equal(insert.run('beta').changes, 1)

  const names = db.prepare('SELECT name FROM videos ORDER BY id').all().map((row) => row.name)
  assert.deepEqual(names, ['alpha', 'beta'])
  db.close()

  const reopened = new DatabaseSync(file)
  const reopenedMode = reopened.prepare('PRAGMA journal_mode').get()
  assert.equal(reopenedMode.journal_mode, 'wal', 'WAL should persist after reopening')
  const count = reopened.prepare('SELECT COUNT(*) AS n FROM videos').get()
  assert.equal(count.n, 2)
  reopened.close()

  console.log('OK node:sqlite opened, wrote, read and kept journal_mode=wal')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
