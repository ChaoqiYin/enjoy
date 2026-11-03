/** Persistence for one space's video records: a page of them, one of them, and the two marks. */

import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from './db.ts'
import { ApiError } from './errors.ts'

/** A record as the list and detail read it. */
export interface Video {
  id: number
  path: string
  fileName: string
  folderPath: string
  fileSize: number
  modifiedAt: number
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnailPath: string | null
  favorite: boolean
  playCount: number
  lastPlayedAt: number | null
  createdAt: number
  updatedAt: number
}

/** The condition a listing is about. `all` is the library itself. */
export type VideoFilter = 'all' | 'favorites' | 'played'

/** The orders a listing can be read in. */
export type VideoSort = 'newest' | 'played' | 'name' | 'size'

/** How many records one page holds when the caller does not say. */
export const DEFAULT_LIMIT = 24

export interface VideoQuery {
  spaceId: number
  only: VideoFilter
  sort: VideoSort
  offset: number
  limit: number
}

export interface VideoPage {
  videos: Video[]
  total: number
}

/**
 * The columns a record is read from, in the order `readVideo` reads them.
 *
 * Written once so the list and the single-record read cannot drift apart: the
 * two answer with the same shape, and a column added to one and not the other
 * would leave the other's objects a field short.
 */
const COLUMNS = `id, path, file_name, folder_path, file_size, modified_at, duration_ms,
  width, height, codec, thumbnail_path, favorite, play_count, last_played_at,
  created_at, updated_at`

/**
 * The tail of the listing's `ORDER BY`, one entry per order.
 *
 * These are the only strings that reach the sentence; a sort that is not a key
 * here never gets there, because the route refuses the vocabulary first. `id`
 * breaks ties in the same direction as the column, making the order total — two
 * records with one stamp cannot be read on one page and lost on the next.
 */
const ORDERS: Record<VideoSort, string> = {
  newest: 'created_at DESC, id DESC',
  played: 'last_played_at DESC, id DESC',
  name: 'file_name ASC, id ASC',
  size: 'file_size DESC, id DESC',
}

/**
 * The condition each filter adds. `played` asks about the count rather than the
 * time, because a record with a history is one that has been played, however
 * long ago; an unplayed record has no time to be placed by and sorts last.
 */
const FILTERS: Record<VideoFilter, string> = {
  all: '1 = 1',
  favorites: 'favorite = 1',
  played: 'play_count > 0',
}

interface VideoRow {
  id: number
  path: string
  file_name: string
  folder_path: string
  file_size: number
  modified_at: number
  duration_ms: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnail_path: string | null
  favorite: number
  play_count: number
  last_played_at: number | null
  created_at: number
  updated_at: number
}

export class VideoStore {
  readonly db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
  }

  /**
   * One page of a space's records, and how many the same question holds.
   *
   * Both reads run under the same condition so the count cannot describe a
   * different list than the page does: the interface counts pages with it.
   */
  list(query: VideoQuery): VideoPage {
    const where = `space_id = ? AND ${FILTERS[query.only]}`
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM videos WHERE ${where}`).get(query.spaceId) as {
        n: number
      }
    ).n
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM videos WHERE ${where} ORDER BY ${ORDERS[query.sort]} LIMIT ? OFFSET ?`,
      )
      .all(query.spaceId, query.limit, query.offset) as VideoRow[]
    return { videos: rows.map(readVideo), total }
  }

  /** One record by its id, or a not-found error. */
  get(id: number): Video {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM videos WHERE id = ?`)
      .get(id) as VideoRow | undefined
    if (!row) throw new ApiError(404, 'video.not_found', 'Video does not exist')
    return readVideo(row)
  }

  /** Put one record's favorite mark where the caller says, and answer with it. */
  setFavorite(id: number, favorite: boolean): Video {
    return inTransaction(this.db, () => {
      const result = this.db
        .prepare('UPDATE videos SET favorite = ?, updated_at = ? WHERE id = ?')
        .run(favorite ? 1 : 0, Date.now(), id)
      if (Number(result.changes) === 0) {
        throw new ApiError(404, 'video.not_found', 'Video does not exist')
      }
      return this.get(id)
    })
  }

  /**
   * Count one play and stamp it, and answer with the record as it now is.
   *
   * The count is incremented in the statement rather than read and written back
   * in two steps: two opens that overlap must both be counted, and a value read
   * before the other write would lose one of them.
   */
  recordPlayed(id: number): Video {
    return inTransaction(this.db, () => {
      const now = Date.now()
      const result = this.db
        .prepare(
          `UPDATE videos
           SET play_count = play_count + 1, last_played_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(now, now, id)
      if (Number(result.changes) === 0) {
        throw new ApiError(404, 'video.not_found', 'Video does not exist')
      }
      return this.get(id)
    })
  }
}

function readVideo(row: VideoRow): Video {
  return {
    id: row.id,
    path: row.path,
    fileName: row.file_name,
    folderPath: row.folder_path,
    fileSize: row.file_size,
    modifiedAt: row.modified_at,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    codec: row.codec,
    thumbnailPath: row.thumbnail_path,
    favorite: row.favorite === 1,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
