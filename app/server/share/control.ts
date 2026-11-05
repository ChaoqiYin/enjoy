/**
 * The share slot: whether a service is running, starting one, ending one, and
 * what the interface is told.
 *
 * One at a time, and only when the user asks. A service belongs to the space it
 * was started in: switching or deleting that space stops it first. The snapshot
 * it serves is fixed at startup, so a changed shared list is reported as pending
 * paths rather than being pulled out from under a playing television; applying
 * them is an explicit restart.
 */

import type { KernelContext } from 'cordis-app/server'
import { ApiError } from '../library/errors.ts'
import { guarded, sendJson } from '../library/http.ts'
import type { SpaceChange } from '../library/routes.ts'
import type { LibraryStore } from '../library/store.ts'
import type { VideoStore } from '../library/videos.ts'
import {
  machineAddresses,
  type NetworkInterfaces,
} from './addresses.ts'
import { loadPassword, resetPassword, SHARE_USERNAME } from './credentials.ts'
import { DeviceActivity, type ShareDevice } from './devices.ts'
import {
  createWebdavServer,
  DEFAULT_PORT,
  type WebdavLanguage,
  type WebdavServer,
} from './webdav.ts'

/** How many consecutive ports are tried before the start is refused. */
export const PORT_ATTEMPTS = 10

/** How the shared list has moved since the running service copied it. */
export interface SharePendingChanges {
  /** Paths the list gained; the service will serve them after a restart. */
  added: string[]
  /** Paths the list dropped; the service still serves them until restarted. */
  removed: string[]
}

export interface ShareStatus {
  running: boolean
  port: number | null
  username: string
  password: string
  /** A password was reset after the running service copied the old one. */
  needsRestart: boolean
  /** The shared list no longer matches the snapshot the service serves. */
  listChanged: boolean
  /** Which paths differ, so the page can name them and offer a restart. */
  pendingChanges: SharePendingChanges
  missingFiles: number
  devices: ShareDevice[]
  /** Every address a television can be pointed at, most useful first. */
  addresses: string[]
}

export interface ShareInstallOptions {
  store: LibraryStore
  videos: VideoStore
  /** First port to try; `0` asks the OS (used by tests). Default 4918. */
  startPort?: number
  /** Fallback language for the landing page. Default `zh-CN`. */
  language?: WebdavLanguage
  /** Where the machine's addresses are read from; injected by tests. */
  networkInterfaces?: () => NetworkInterfaces
  /** Device table; injected by tests that need a clock. */
  activity?: DeviceActivity
}

export interface ShareController {
  status(): ShareStatus
  open(): Promise<ShareStatus>
  /** Stop and start again, so the running snapshot catches up with the list. */
  restart(): Promise<ShareStatus>
  close(): Promise<ShareStatus>
  resetPassword(): Promise<ShareStatus>
  /** Stop before the current space is changed. */
  beforeSpaceChange(change: SpaceChange): Promise<void>
  /** Release the port when the application goes away. */
  dispose(): void
}

interface RunningShare {
  server: WebdavServer
  port: number
  spaceId: number
  /** The path list the snapshot was built from, sorted. */
  paths: string[]
  /** The password copied into this instance when it started. */
  password: string
}

export function installShare(
  ctx: KernelContext,
  options: ShareInstallOptions,
): ShareController {
  const controller = createShareController(options)
  ctx.router.get(
    '/api/share/status',
    guarded(async (_req, res) => {
      sendJson(res, 200, controller.status())
    }),
  )
  ctx.router.post(
    '/api/share/open',
    guarded(async (_req, res) => {
      sendJson(res, 200, await controller.open())
    }),
  )
  ctx.router.post(
    '/api/share/restart',
    guarded(async (_req, res) => {
      sendJson(res, 200, await controller.restart())
    }),
  )
  ctx.router.post(
    '/api/share/close',
    guarded(async (_req, res) => {
      sendJson(res, 200, await controller.close())
    }),
  )
  ctx.router.post(
    '/api/share/password',
    guarded(async (_req, res) => {
      sendJson(res, 200, await controller.resetPassword())
    }),
  )
  ctx.effect(() => () => controller.dispose())
  return controller
}

function createShareController(options: ShareInstallOptions): ShareController {
  const { store, videos } = options
  const activity = options.activity ?? new DeviceActivity()
  const startPort = options.startPort ?? DEFAULT_PORT
  const language = options.language ?? 'zh-CN'

  let running: RunningShare | null = null
  let opening = false

  /** The credentials a service started now would use. */
  const credentials = (): { username: string; password: string } => ({
    username: SHARE_USERNAME,
    password: loadPassword(store),
  })

  const status = (): ShareStatus => {
    const { username, password } = credentials()
    const current = store.currentSpace()
    const currentPaths = current ? videos.sharedPaths(current.id) : []
    const active = running
    // Only a running service has a snapshot to differ from: with nothing
    // running, every path is simply the list, not a pending change.
    const pendingChanges =
      active === null
        ? { added: [], removed: [] }
        : diffPaths(active.paths, currentPaths)
    return {
      running: active !== null,
      port: active?.port ?? null,
      username,
      password,
      needsRestart: active !== null && active.password !== password,
      listChanged:
        pendingChanges.added.length > 0 || pendingChanges.removed.length > 0,
      pendingChanges,
      missingFiles: active?.server.missingFiles ?? 0,
      devices: active ? activity.recent() : [],
      addresses: machineAddresses(options.networkInterfaces?.()),
    }
  }

  const stopRunning = async (): Promise<void> => {
    const active = running
    if (active === null) return
    try {
      await active.server.close()
    } catch {
      throw new ApiError(409, 'share.stop_failed', 'The share service could not be stopped')
    }
    if (running === active) running = null
    activity.clear()
  }

  const open = async (): Promise<ShareStatus> => {
    if (running !== null || opening) {
      throw new ApiError(409, 'share.already_running', 'The share service is already running')
    }
    opening = true
    try {
      const spaceId = store.resolveSpaceId()
      const paths = videos.sharedPaths(spaceId)
      const current = credentials()
      // A new service starts with nobody connected, even if the previous one
      // was stopped a moment ago.
      activity.clear()
      const server = await startListener({
        paths,
        password: current.password,
        base: startPort,
        language,
        activity,
      })
      running = { server, port: server.port, spaceId, paths, password: current.password }
    } finally {
      opening = false
    }
    return status()
  }

  return {
    status,

    open,

    async restart() {
      // Stopping first means a failed start leaves nothing running rather than
      // an old snapshot that the page reports as current. The user is told the
      // start failed and can ask again.
      await stopRunning()
      return open()
    },

    async close() {
      await stopRunning()
      return status()
    },

    async resetPassword() {
      resetPassword(store)
      return status()
    },

    async beforeSpaceChange(change) {
      if (running === null) return
      const stops =
        change.kind === 'create' ||
        change.kind === 'switch' ||
        (change.kind === 'delete' && change.spaceId === running.spaceId)
      if (stops) await stopRunning()
    },

    dispose() {
      void stopRunning().catch(() => undefined)
    },
  }
}

/** What one listener start is asked for, named so the call site reads as a
 *  checklist rather than as five positional values of different kinds. */
interface ListenerOptions {
  paths: string[]
  password: string
  base: number
  language: WebdavLanguage
  activity: DeviceActivity
}

/**
 * Bind one of the consecutive ports, starting at `base`.
 *
 * `0` is the test path: the operating system picks a free port and there is
 * nothing to search. Otherwise every port in the run is tried, and the failure
 * names the one thing worth a sentence — all ten were held — separately from any
 * other reason a bind can fail.
 */
async function startListener({
  paths,
  password,
  base,
  language,
  activity,
}: ListenerOptions): Promise<WebdavServer> {
  const connect = (port: number): Promise<WebdavServer> =>
    createWebdavServer({
      paths,
      credentials: { username: SHARE_USERNAME, password },
      language,
      port,
      onAuthenticated: ({ address, userAgent }) => {
        activity.record(normalizeAddress(address), userAgent)
      },
    })

  if (base === 0) {
    try {
      return await connect(0)
    } catch {
      throw new ApiError(409, 'share.start_failed', 'The share service could not be started')
    }
  }

  let held = false
  for (let offset = 0; offset < PORT_ATTEMPTS; offset += 1) {
    const port = base + offset
    if (port > 65535) break
    try {
      return await connect(port)
    } catch (error) {
      if ((error as { code?: unknown }).code === 'EADDRINUSE') held = true
    }
  }
  throw held
    ? new ApiError(
        409,
        'share.port_in_use',
        'Every port the share service tried is already in use',
      )
    : new ApiError(409, 'share.start_failed', 'The share service could not be started')
}

/** `::ffff:192.168.1.20` is the same device as `192.168.1.20`. */
function normalizeAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
}

function diffPaths(
  served: readonly string[],
  current: readonly string[],
): SharePendingChanges {
  const servedSet = new Set(served)
  const currentSet = new Set(current)
  return {
    added: current.filter((path) => !servedSet.has(path)),
    removed: served.filter((path) => !currentSet.has(path)),
  }
}

