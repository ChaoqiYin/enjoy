/** `/api` routes for the library. Registered on `ctx.router` by `installLibrary`. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { KernelContext } from 'cordis-app/server'
import { ApiError } from './errors.ts'
import { readJson, sendError, sendJson } from './http.ts'
import { LibraryStore } from './store.ts'

export interface RouteDependencies {
  /** Stub until the scan task (#112) owns the real slot. */
  isScanActive: () => boolean
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>

/** Route handlers translate domain failures into the shared JSON error shape. */
function wrap(handler: Handler) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> => {
    try {
      await handler(req, res, params)
    } catch (error) {
      if (error instanceof ApiError) {
        sendError(res, error.status, error.code, error.message)
        return
      }
      sendError(res, 500, 'internal_error', '请求处理失败')
    }
  }
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
  const spaceCommand = (handler: Handler): Handler =>
    wrap(async (req, res, params) => {
      if (deps.isScanActive()) {
        throw new ApiError(409, 'space.blocked.scanning', 'A scan is using the library')
      }
      await handler(req, res, params)
    })

  ctx.router.get(
    '/api/spaces',
    wrap(async (_req, res) => {
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
    wrap(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const spaceId = store.resolveSpaceId(optionalId(url.searchParams.get('spaceId')))
      sendJson(res, 200, { directories: store.listDirectories(spaceId) })
    }),
  )

  ctx.router.post(
    '/api/directories',
    wrap(async (req, res) => {
      const body = await readJson(req)
      const input = body as { path?: unknown; spaceId?: unknown } | undefined
      const spaceId = store.resolveSpaceId(optionalId(input?.spaceId))
      const directory = store.addDirectory(spaceId, requiredPath(input?.path))
      sendJson(res, 201, { directory })
    }),
  )

  ctx.router.delete(
    '/api/directories/:id',
    wrap(async (_req, res, params) => {
      const directory = store.removeDirectory(requiredId(params.id))
      sendJson(res, 200, { directory })
    }),
  )

  ctx.router.get(
    '/api/settings',
    wrap(async (_req, res) => {
      sendJson(res, 200, { settings: store.getSettings() })
    }),
  )

  ctx.router.put(
    '/api/settings',
    wrap(async (req, res) => {
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

/** Read an optional positive integer id; `undefined` means "use the default". */
function optionalId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  return requiredId(String(raw))
}

function requiredPath(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'bad_request', 'body.path must be a string')
  }
  return raw
}

/** Read a positive integer id from a route parameter. */
function requiredId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'bad_request', 'id must be a positive integer')
  }
  return id
}

/** Read `{ name }` from a request body, rejecting anything else as bad input. */
function requiredName(body: unknown): string {
  const name = (body as { name?: unknown } | undefined)?.name
  if (typeof name !== 'string') {
    throw new ApiError(400, 'bad_request', 'body.name must be a string')
  }
  return name
}
