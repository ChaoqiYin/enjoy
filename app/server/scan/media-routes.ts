/** `GET /api/media/tools`: what the media phases will run, for the settings page. */

import type { KernelContext } from 'cordis-app/server'
import { guarded, sendJson } from '../library/http.ts'
import { detectMediaTools, type MediaToolDetection } from './media.ts'

/** The detector is a parameter so a test can answer without the host's installs. */
export function registerMediaRoutes(
  ctx: KernelContext,
  detect: () => MediaToolDetection = () => detectMediaTools(),
): void {
  ctx.router.get(
    '/api/media/tools',
    guarded(async (_req, res) => {
      sendJson(res, 200, detect())
    }),
  )
}
