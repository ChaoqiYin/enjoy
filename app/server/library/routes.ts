/** `/api` routes for the library. Registered on `ctx.router` by `installLibrary`. */

import type { KernelContext } from 'cordis-app/server'
import { ApiError } from './errors.ts'
import { guarded, optionalId, readJson, requiredId, sendJson, type RouteHandler } from './http.ts'
import { LibraryStore } from './store.ts'

export interface RouteDependencies {
  /** Whether a scan currently owns the slot. Injected by the scan task. */
  isScanActive: () => boolean
  /**
   * Called before the current space marker moves or a space is removed.
   *
   * The share service belongs to the space it was started in, so it has to
   * stop before the page can show another one. The hook is injected by the
   * server entry; a library used on its own has nothing to stop.
   */
  beforeSpaceChange?: (change: SpaceChange) => Promise<void>
}

/** A command that can change which space is current. */
export interface SpaceChange {
  kind: 'create' | 'switch' | 'delete'
  /** The space switched to or deleted; absent when a new one is created. */
  spaceId?: number
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
      const name = requiredName(body)
      // A refused name must not stop a running share service, so validation
      // happens before the hook.
      store.assertCreatableSpace(name)
      await deps.beforeSpaceChange?.({ kind: 'create' })
      const space = store.createSpace(name)
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
      const id = requiredId(params.id)
      store.resolveSpaceId(id)
      // Switching to the space already shown changes nothing, so it must not
      // stop the service that belongs to it.
      const current = store.currentSpace()
      if (current?.id === id) {
        sendJson(res, 200, { space: current })
        return
      }
      await deps.beforeSpaceChange?.({ kind: 'switch', spaceId: id })
      const space = store.switchSpace(id)
      sendJson(res, 200, { space })
    }),
  )

  ctx.router.delete(
    '/api/spaces/:id',
    spaceCommand(async (_req, res, params) => {
      const id = requiredId(params.id)
      // An unknown id or the last remaining space is answered before anything
      // is stopped: a refusal must not take a running share service down.
      store.assertRemovableSpace(id)
      await deps.beforeSpaceChange?.({ kind: 'delete', spaceId: id })
      const space = store.deleteSpace(id)
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
