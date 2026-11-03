/**
 * Indexing: bring one space in line with what discovery found.
 *
 * The whole write is one transaction. A scan that is cancelled partway leaves
 * the index as it was rather than half-synced.
 *
 * Ranking of the removal rule, in one place:
 *   - a file discovered this run survives;
 *   - a record under a path that failed although it still exists survives;
 *   - a record under a root this run could not classify survives (unreachable
 *     or not a directory);
 *   - everything else in the space goes: files deleted under a readable root,
 *     records under a root that has disappeared, and records that belong to no
 *     configured directory any more.
 */

import type { DatabaseSync } from 'node:sqlite'
import { sep } from 'node:path'
import type { ScanControl } from './control.ts'
import type { DiscoveredFile, RootScan, ScanChanges } from './types.ts'

export interface IndexReport {
  onIndexed(file: DiscoveredFile, indexed: number): void
}

export interface IndexResult {
  changes: ScanChanges
  indexed: number
}

export function indexScan(
  db: DatabaseSync,
  spaceId: number,
  scans: RootScan[],
  control: ScanControl,
  report: IndexReport,
): IndexResult {
  const changes: ScanChanges = { added: 0, updated: 0, removed: 0 }
  let indexed = 0

  db.exec('BEGIN')
  try {
    db.exec(
      `CREATE TEMP TABLE IF NOT EXISTS scan_discovered (path TEXT PRIMARY KEY);
       CREATE TEMP TABLE IF NOT EXISTS scan_protected (path TEXT PRIMARY KEY);
       CREATE TEMP TABLE IF NOT EXISTS scan_preserved (path TEXT PRIMARY KEY);
       DELETE FROM scan_discovered;
       DELETE FROM scan_protected;
       DELETE FROM scan_preserved;`,
    )

    const findStamp = db.prepare(
      'SELECT file_size, modified_at FROM videos WHERE space_id = ? AND path = ?',
    )
    const markDiscovered = db.prepare('INSERT OR IGNORE INTO scan_discovered (path) VALUES (?)')
    const markProtected = db.prepare('INSERT OR IGNORE INTO scan_protected (path) VALUES (?)')
    const markPreserved = db.prepare('INSERT OR IGNORE INTO scan_preserved (path) VALUES (?)')
    const upsert = db.prepare(
      `INSERT INTO videos (space_id, path, file_name, folder_path, file_size, modified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(space_id, path) DO UPDATE SET
         file_name = excluded.file_name,
         folder_path = excluded.folder_path,
         file_size = excluded.file_size,
         modified_at = excluded.modified_at,
         duration_ms = CASE WHEN ?9 THEN NULL ELSE videos.duration_ms END,
         width = CASE WHEN ?9 THEN NULL ELSE videos.width END,
         height = CASE WHEN ?9 THEN NULL ELSE videos.height END,
         codec = CASE WHEN ?9 THEN NULL ELSE videos.codec END,
         thumbnail_path = CASE WHEN ?9 THEN NULL ELSE videos.thumbnail_path END,
         updated_at = CASE WHEN ?9 THEN excluded.updated_at ELSE videos.updated_at END`,
    )
    const now = Date.now()

    for (const scan of scans) {
      control.checkpoint()
      if (scan.verdict === 'unreachable' || scan.verdict === 'not-a-directory') {
        // This run knows nothing about the path, so its records stay untouched.
        markPreserved.run(scan.path)
        continue
      }
      if (scan.verdict === 'gone') {
        // Nothing under it survives; no discovered and no protected paths.
        continue
      }

      for (const file of scan.files) {
        control.checkpoint()
        const previous = findStamp.get(spaceId, file.path) as
          | { file_size: number; modified_at: number }
          | undefined
        const changed =
          previous !== undefined &&
          (previous.file_size !== file.fileSize || previous.modified_at !== file.modifiedAt)
        if (previous === undefined) changes.added += 1
        else if (changed) changes.updated += 1

        markDiscovered.run(file.path)
        upsert.run(
          spaceId,
          file.path,
          file.fileName,
          file.folderPath,
          file.fileSize,
          file.modifiedAt,
          now,
          now,
          changed ? 1 : 0,
        )
        indexed += 1
        report.onIndexed(file, indexed)
      }

      for (const path of scan.unreadable) markProtected.run(path)
    }

    const removal = db.prepare(
      `DELETE FROM videos
       WHERE space_id = ?
         AND NOT EXISTS (SELECT 1 FROM scan_discovered d WHERE d.path = videos.path)
         AND NOT EXISTS (
           SELECT 1 FROM scan_protected p
           WHERE videos.path = p.path
              OR substr(videos.path, 1, length(p.path) + 1) = p.path || ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM scan_preserved r
           WHERE videos.path = r.path
              OR substr(videos.path, 1, length(r.path) + 1) = r.path || ?
         )`,
    )
    changes.removed = Number(removal.run(spaceId, sep, sep).changes)

    control.checkpoint()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return { changes, indexed }
}
