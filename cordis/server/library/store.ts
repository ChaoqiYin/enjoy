/** Persistence for spaces, directories and application settings. */

import { isAbsolute, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { inTransaction, retryBusy } from './db.ts'
import { ApiError } from './errors.ts'

export interface Space {
  id: number
  name: string
  current: boolean
}

export interface Directory {
  id: number
  spaceId: number
  path: string
}

/** A space name is at most this many characters, in any script. */
const NAME_MAX = 24

export class LibraryStore {
  readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  /** Every space, oldest first, so the list is stable between openings. */
  listSpaces(): Space[] {
    const rows = this.db
      .prepare('SELECT id, name, current FROM spaces ORDER BY created_at, id')
      .all() as { id: number; name: string; current: number }[]
    return rows.map(readSpace)
  }

  /** Add a space and move the current marker into it, atomically. */
  createSpace(rawName: string): Space {
    const name = checkedName(rawName)
    return this.transaction(() => {
      if (this.nameTaken(name)) {
        throw new ApiError(409, 'space.name.taken', 'Another space has this name')
      }
      const result = this.db
        .prepare('INSERT INTO spaces (name, created_at, current) VALUES (?, ?, 0)')
        .run(name, Date.now())
      const id = Number(result.lastInsertRowid)
      this.moveMarker(id)
      return this.getSpace(id)!
    })
  }

  /** Give a space a new name; nothing else about it changes. */
  renameSpace(id: number, rawName: string): Space {
    const name = checkedName(rawName)
    return this.transaction(() => {
      this.requireSpace(id)
      if (this.nameTaken(name, id)) {
        throw new ApiError(409, 'space.name.taken', 'Another space has this name')
      }
      this.db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(name, id)
      return this.getSpace(id)!
    })
  }

  /**
   * Remove a space and everything the index held for it. The files on disk are
   * not ours to touch. When the current space goes, the marker moves to the
   * oldest remaining space in the same transaction.
   */
  deleteSpace(id: number): Space {
    return this.transaction(() => {
      this.requireSpace(id)
      const total = (this.db.prepare('SELECT COUNT(*) AS n FROM spaces').get() as { n: number }).n
      if (total <= 1) {
        throw new ApiError(409, 'space.remove_last', 'The last space cannot be removed')
      }
      this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
      const holder = this.db.prepare('SELECT id FROM spaces WHERE current = 1').get()
      if (!holder) {
        const oldest = this.db
          .prepare('SELECT id FROM spaces ORDER BY created_at, id LIMIT 1')
          .get() as { id: number } | undefined
        if (oldest) this.moveMarker(oldest.id)
      }
      return this.currentSpace()!
    })
  }

  currentSpace(): Space | undefined {
    const row = this.db
      .prepare('SELECT id, name, current FROM spaces WHERE current = 1')
      .get() as { id: number; name: string; current: number } | undefined
    return row ? readSpace(row) : undefined
  }

  /** Resolve an explicitly named space, or fall back to the current one. */
  resolveSpaceId(explicit?: number): number {
    if (explicit !== undefined) {
      this.requireSpace(explicit)
      return explicit
    }
    const current = this.currentSpace()
    if (!current) {
      throw new ApiError(500, 'internal_error', 'No current space')
    }
    return current.id
  }

  /** Directories saved in one space, ordered by path. */
  listDirectories(spaceId: number): Directory[] {
    const rows = this.db
      .prepare('SELECT id, space_id, path FROM directories WHERE space_id = ? ORDER BY path')
      .all(spaceId) as DirectoryRow[]
    return rows.map(readDirectory)
  }

  /** Save a directory; adding the same path twice returns the existing row. */
  addDirectory(spaceId: number, rawPath: string): Directory {
    const path = checkedPath(rawPath)
    return this.transaction(() => {
      this.requireSpace(spaceId)
      const existing = this.db
        .prepare('SELECT id, space_id, path FROM directories WHERE space_id = ? AND path = ?')
        .get(spaceId, path) as DirectoryRow | undefined
      if (existing) return readDirectory(existing)
      const result = this.db
        .prepare('INSERT INTO directories (space_id, path) VALUES (?, ?)')
        .run(spaceId, path)
      return { id: Number(result.lastInsertRowid), spaceId, path }
    })
  }

  /** Remove a directory; its membership rows cascade with it. */
  removeDirectory(id: number): Directory {
    const row = this.db
      .prepare('SELECT id, space_id, path FROM directories WHERE id = ?')
      .get(id) as DirectoryRow | undefined
    if (!row) {
      throw new ApiError(404, 'directory.not_found', 'Directory does not exist')
    }
    this.db.prepare('DELETE FROM directories WHERE id = ?').run(id)
    return readDirectory(row)
  }

  /** Every application setting, as JSON values keyed by name. */
  getSettings(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]))
  }

  /** Merge a patch into the settings table and answer with the whole set. */
  putSettings(patch: Record<string, unknown>): Record<string, unknown> {
    return this.transaction(() => {
      const statement = this.db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      const now = Date.now()
      for (const [key, value] of Object.entries(patch)) {
        statement.run(key, JSON.stringify(value), now)
      }
      return this.getSettings()
    })
  }

  /** Move the current marker to an existing space. */
  switchSpace(id: number): Space {
    return this.transaction(() => {
      this.requireSpace(id)
      this.moveMarker(id)
      return this.getSpace(id)!
    })
  }

  private requireSpace(id: number): void {
    if (!this.getSpace(id)) {
      throw new ApiError(404, 'space.not_found', 'Space does not exist')
    }
  }

  private getSpace(id: number): Space | undefined {
    const row = this.db
      .prepare('SELECT id, name, current FROM spaces WHERE id = ?')
      .get(id) as { id: number; name: string; current: number } | undefined
    return row ? readSpace(row) : undefined
  }

  private nameTaken(name: string, ignore?: number): boolean {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM spaces WHERE name = ? COLLATE NOCASE AND (? IS NULL OR id <> ?)',
      )
      .get(name, ignore ?? null, ignore ?? null) as { n: number }
    return row.n > 0
  }

  private moveMarker(id: number): void {
    this.db.exec('UPDATE spaces SET current = 0 WHERE current = 1')
    this.db.prepare('UPDATE spaces SET current = 1 WHERE id = ?').run(id)
  }

  private transaction<T>(run: () => T): T {
    return retryBusy(() => inTransaction(this.db, run))
  }
}

function checkedName(raw: string): string {
  const name = raw.trim()
  if (!name) throw new ApiError(400, 'space.name.empty', 'Space name is empty')
  if ([...name].length > NAME_MAX) {
    throw new ApiError(400, 'space.name.too_long', 'Space name is too long')
  }
  return name
}

function readSpace(row: { id: number; name: string; current: number }): Space {
  return { id: row.id, name: row.name, current: row.current === 1 }
}

interface DirectoryRow {
  id: number
  space_id: number
  path: string
}

function readDirectory(row: DirectoryRow): Directory {
  return { id: row.id, spaceId: row.space_id, path: row.path }
}

/**
 * A configured directory is stored as an absolute, normalized path.
 *
 * The client checks the shape first so a mistyped path fails next to the
 * input, but the server is the authority: a relative path would make every
 * later comparison depend on the process's working directory.
 */
function checkedPath(raw: string): string {
  const path = raw.trim()
  if (!path) {
    throw new ApiError(400, 'directory.path.empty', 'Directory path is empty')
  }
  if (!isAbsolute(path)) {
    throw new ApiError(400, 'directory.path.absolute', 'Directory path must be absolute')
  }
  return resolve(path)
}

export { ApiError }
