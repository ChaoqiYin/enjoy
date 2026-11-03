/**
 * The media phases: fill metadata, then write one JPEG per video.
 *
 * Both phases are per-file best effort. A file that ffprobe or ffmpeg cannot
 * read adds one failure and is left alone; the scan carries on with the next
 * file, and the record keeps whatever the index phase already stored.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { ScanControl } from './control.ts'
import {
  probeMedia,
  resolveMediaTools,
  thumbnailFileName,
  toolsAvailable,
  writeThumbnail,
  type MediaTools,
} from './media.ts'
import type { ScanMode, ScanPhase } from './types.ts'

export interface MediaProgress {
  currentPath: string
  metadataReady: number
  thumbnailsReady: number
  failures: number
}

export interface MediaReport {
  onPhase(phase: ScanPhase): void
  onProgress(progress: MediaProgress): void
}

export interface MediaResult {
  metadataReady: number
  thumbnailsReady: number
  failures: number
}

interface MediaRow {
  id: number
  path: string
  modified_at: number
  duration_ms: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnail_path: string | null
}

/**
 * Run both media phases for one space.
 *
 * `scan` skips rows whose cache is already present; `thumbnails` (the rebuild
 * command) rewrites every JPEG so a changed encoding or a lost cache directory
 * is repaired.
 */
export async function processMedia(
  db: DatabaseSync,
  spaceId: number,
  thumbnailsDir: string,
  control: ScanControl,
  mode: ScanMode,
  report: MediaReport,
  tools: MediaTools = resolveMediaTools(),
): Promise<MediaResult> {
  const rows = db
    .prepare(
      `SELECT id, path, modified_at, duration_ms, width, height, codec, thumbnail_path
       FROM videos WHERE space_id = ? ORDER BY id`,
    )
    .all(spaceId) as unknown as MediaRow[]

  let metadataReady = 0
  let thumbnailsReady = 0
  let failures = 0

  const state: MediaProgress = {
    currentPath: '',
    metadataReady,
    thumbnailsReady,
    failures,
  }
  const publish = (): void => {
    state.metadataReady = metadataReady
    state.thumbnailsReady = thumbnailsReady
    state.failures = failures
    report.onProgress({ ...state })
  }

  // A machine without the tools still gets a completed scan: every file that
  // needed one is counted as a failure, but no process is started per file.
  const available = await toolsAvailable(tools)

  report.onPhase('metadata')
  const updateMetadata = db.prepare(
    'UPDATE videos SET duration_ms = ?, width = ?, height = ?, codec = ? WHERE id = ?',
  )
  for (const row of rows) {
    control.checkpoint()
    state.currentPath = row.path
    publish()
    if (hasMetadata(row)) {
      metadataReady += 1
    } else if (!available) {
      failures += 1
    } else {
      try {
        const metadata = await probeMedia(row.path, tools)
        updateMetadata.run(
          metadata.durationMs,
          metadata.width,
          metadata.height,
          metadata.codec,
          row.id,
        )
        Object.assign(row, metadata)
        metadataReady += 1
      } catch {
        failures += 1
      }
    }
    publish()
  }

  report.onPhase('thumbnails')
  const updateThumbnail = db.prepare('UPDATE videos SET thumbnail_path = ? WHERE id = ?')
  for (const row of rows) {
    control.checkpoint()
    state.currentPath = row.path
    publish()
    if (mode === 'scan' && row.thumbnail_path !== null && existsSync(row.thumbnail_path)) {
      thumbnailsReady += 1
      publish()
      continue
    }
    const target = join(thumbnailsDir, thumbnailFileName(row.id, row.modified_at))
    if (!available) {
      failures += 1
      publish()
      continue
    }
    try {
      await writeThumbnail(row.path, target, tools)
      updateThumbnail.run(target, row.id)
      row.thumbnail_path = target
      thumbnailsReady += 1
    } catch {
      failures += 1
    }
    publish()
  }

  return { metadataReady, thumbnailsReady, failures }
}

function hasMetadata(row: MediaRow): boolean {
  return (
    row.duration_ms !== null &&
    row.width !== null &&
    row.height !== null &&
    row.codec !== null
  )
}
