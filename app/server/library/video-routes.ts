/** `/api/videos` routes: one page, one record, the favorite mark and the play count. */

import type { IncomingMessage } from 'node:http'
import type { KernelContext } from 'cordis-app/server'
import { ApiError } from './errors.ts'
import { guarded, optionalId, readJson, requiredId, sendJson } from './http.ts'
import type { LibraryStore } from './store.ts'
import {
  DEFAULT_LIMIT,
  type VideoFilter,
  type VideoQuery,
  type VideoSort,
  VideoStore,
} from './videos.ts'

/** The closed vocabularies the query accepts; anything else is refused, not defaulted. */
const FILTERS: readonly VideoFilter[] = ['all', 'favorites', 'played']
const SORTS: readonly VideoSort[] = ['newest', 'played', 'name', 'size']

export function registerVideoRoutes(
  ctx: KernelContext,
  videos: VideoStore,
  spaces: LibraryStore,
): void {
  ctx.router.get(
    '/api/videos',
    guarded(async (req, res) => {
      const page = videos.list(parseQuery(req, spaces))
      sendJson(res, 200, page)
    }),
  )

  ctx.router.get(
    '/api/videos/:id',
    guarded(async (_req, res, params) => {
      sendJson(res, 200, { video: videos.get(requiredId(params.id)) })
    }),
  )

  ctx.router.put(
    '/api/videos/:id/favorite',
    guarded(async (req, res, params) => {
      const body = await readJson(req)
      const favorite = (body as { favorite?: unknown } | undefined)?.favorite
      if (typeof favorite !== 'boolean') {
        throw new ApiError(400, 'bad_request', 'body.favorite must be a boolean')
      }
      sendJson(res, 200, { video: videos.setFavorite(requiredId(params.id), favorite) })
    }),
  )

  ctx.router.put(
    '/api/videos/:id/played',
    guarded(async (_req, res, params) => {
      sendJson(res, 200, { video: videos.recordPlayed(requiredId(params.id)) })
    }),
  )
}

/**
 * Read a listing request.
 *
 * `spaceId` is optional and falls back to the space the marker names, as the
 * directory routes do. The rest is the listing's own vocabulary: an order or a
 * filter this build does not know is a question that cannot be answered, so it
 * is refused rather than silently replaced by the default. A page past the end
 * is not an error — the list simply has nothing there.
 */
function parseQuery(req: IncomingMessage, spaces: LibraryStore): VideoQuery {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  return {
    spaceId: spaces.resolveSpaceId(optionalId(url.searchParams.get('spaceId'))),
    only: oneOf(url.searchParams.get('only'), FILTERS, 'all', 'only'),
    sort: oneOf(url.searchParams.get('sort'), SORTS, 'newest', 'sort'),
    search: text(url.searchParams.get('search')),
    folder: text(url.searchParams.get('folder')),
    offset: count(url.searchParams.get('offset'), 0, 'offset'),
    limit: count(url.searchParams.get('limit'), DEFAULT_LIMIT, 'limit'),
  }
}

/** A free-text query value, trimmed; an absent one narrows nothing. */
function text(raw: string | null): string {
  return raw === null ? '' : raw.trim()
}

/** Read a closed-vocabulary query value, falling back only when it was not given. */
function oneOf<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (raw === null || raw === '') return fallback
  if ((allowed as readonly string[]).includes(raw)) return raw as T
  throw new ApiError(400, 'bad_request', `${name} must be one of ${allowed.join(', ')}`)
}

/** Read a non-negative integer query value, or the fallback when it was omitted. */
function count(raw: string | null, fallback: number, name: string): number {
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(400, 'bad_request', `${name} must be a non-negative integer`)
  }
  return value
}
