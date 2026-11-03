/**
 * The plugin catalogue.
 *
 * The first cordis version ships no application plugins, so the route exists
 * only to say that: the page reads an answer from the server instead of
 * assuming an empty list of its own.
 */

import type { KernelContext } from 'cordis-app/server'
import { guarded, sendJson } from '../library/http.ts'

export function installPlugins(ctx: KernelContext): void {
  ctx.router.get(
    '/api/plugins',
    guarded(async (_req, res) => {
      sendJson(res, 200, { plugins: [] })
    }),
  )
}
