/** `/api` routes for the library. Registered on `ctx.router` by `installLibrary`. */

import type { KernelContext } from 'cordis-app/server'
import { ApiError } from './errors.ts'
import { guarded, optionalId, readJson, requiredId, sendJson, type RouteHandler } from './http.ts'
import { LibraryStore } from './store.ts'

export interface RouteDependencies {
  /** Whether a scan currently owns the slot. Injected by the scan task. */
  isScanActive: () => boolean
}

export function registerRoutes(
  ctx: KernelContext,
  store: LibraryStore,
  deps: RouteDependencies,
): void {
  /**
   * The four commands that change the set of spaces or which one is shown are
   * refused while the scan slot is occupied. Reads stay available: the page
   * still needs to render the space it is on.
   */
  const spaceCommand = (handler: RouteHandler): RouteHandler =>
    guarded(async (req, res, params) => {
      if (deps.isScanActive()) {
        throw new ApiError(409, 'space.blocked.scanning', 'A scan is using the library')
      }
      await handler(req, res, params)
    })

  ctx.router.get(
    '/api/spaces',
    guarded(async (_req, res) => {
      sendJson(res, 200, { spaces: store.listSpaces() })
    }),
  )

  ctx.router.post(
    '/api/spaces',
    spaceCommand(async (req, res) => {
      const body = await readJson(req)
      const space = store.createSpace(requiredName(body))
      sendJson(res, 201, { space })
    }),
  )

  ctx.router.put(
    '/api/spaces/:id',
    spaceCommand(async (req, res, params) => {
      const body = await readJson(req)
      const space = store.renameSpace(requiredId(params.id), requiredName(body))
      sendJson(res, 200, { space })
    }),
  )

  ctx.router.post(
    '/api/spaces/:id/switch',
    spaceCommand(async (_req, res, params) => {
      const space = store.switchSpace(requiredId(params.id))
      sendJson(res, 200, { space })
    }),
  )

  ctx.router.delete(
    '/api/spaces/:id',
    spaceCommand(async (_req, res, params) => {
      const space = store.deleteSpace(requiredId(params.id))
      sendJson(res, 200, { space })
    }),
  )

  ctx.router.get(
    '/api/directories',
    guarded(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const spaceId = store.resolveSpaceId(optionalId(url.searchParams.get('spaceId')))
      sendJson(res, 200, { directories: store.listDirectories(spaceId) })
    }),
  )

  ctx.router.post(
    '/api/directories',
    guarded(async (req, res) => {
      const body = await readJson(req)
      const input = body as { path?: unknown; spaceId?: unknown } | undefined
      const spaceId = store.resolveSpaceId(optionalId(input?.spaceId))
      const directory = store.addDirectory(spaceId, requiredPath(input?.path))
      sendJson(res, 201, { directory })
    }),
  )

  ctx.router.delete(
    '/api/directories/:id',
    guarded(async (_req, res, params) => {
      const directory = store.removeDirectory(requiredId(params.id))
      sendJson(res, 200, { directory })
    }),
  )

  ctx.router.get(
    '/api/settings',
    guarded(async (_req, res) => {
      sendJson(res, 200, { settings: store.getSettings() })
    }),
  )

  ctx.router.put(
    '/api/settings',
    guarded(async (req, res) => {
      const body = await readJson(req)
      const settings = store.putSettings(requiredSettings(body))
      sendJson(res, 200, { settings })
    }),
  )
}

/** Read `{ settings }` as a plain object of JSON values. */
function requiredSettings(body: unknown): Record<string, unknown> {
  const settings = (body as { settings?: unknown } | undefined)?.settings
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    throw new ApiError(400, 'bad_request', 'body.settings must be an object')
  }
  return settings as Record<string, unknown>
}

/** Read a directory path from a request body. */
function requiredPath(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'bad_request', 'body.path must be a string')
  }
  return raw
}

/** Read `{ name }` from a request body, rejecting anything else as bad input. */
function requiredName(body: unknown): string {
  const name = (body as { name?: unknown } | undefined)?.name
  if (typeof name !== 'string') {
    throw new ApiError(400, 'bad_request', 'body.name must be a string')
  }
  return name
}
