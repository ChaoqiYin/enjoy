/** Serves the cached JPEG a scan wrote; the database keeps its absolute path. */

import { readFileSync } from 'node:fs'
import type { KernelContext } from 'cordis-app/server'
import { ApiError } from './errors.ts'
import { guarded, requiredId } from './http.ts'
import type { VideoStore } from './videos.ts'

export function registerThumbnailRoutes(ctx: KernelContext, videos: VideoStore): void {
  ctx.router.get(
    '/api/thumbnails/:videoId',
    guarded(async (_req, res, params) => {
      const video = videos.get(requiredId(params.videoId))
      if (video.thumbnailPath === null) {
        throw new ApiError(404, 'thumbnail.not_found', 'Thumbnail does not exist')
      }

      let bytes: Buffer
      try {
        bytes = readFileSync(video.thumbnailPath)
      } catch {
        // The record outlived its cache file: answer as if there were no
        // thumbnail, so the page falls back to its placeholder.
        throw new ApiError(404, 'thumbnail.not_found', 'Thumbnail does not exist')
      }

      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': bytes.length,
        'cache-control': 'no-cache',
      })
      res.end(bytes)
    }),
  )
}
