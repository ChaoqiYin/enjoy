import type { KernelContext } from 'cordis-app/server'
import { installLibrary } from './library/index.ts'

import { registerNativeRoutes } from './native/index.ts'

/**
 * Project backend entry.
 *
 * The worker calls the default export after built-in plugins and before
 * application plugins. It is not an application plugin: there is no
 * plugin.json and it cannot be installed or removed.
 */
export default function apply(ctx: KernelContext): void {
  installLibrary(ctx)
  registerNativeRoutes(ctx)

  ctx.router.get('/api/hello', (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ hello: 'world' }))
  })
}
