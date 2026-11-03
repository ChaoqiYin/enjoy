/**
 * The scan slot, its HTTP state machine and the worker thread that does the work.
 *
 * There is one slot per application. A scan occupies it from `POST /api/scan`
 * until the worker reports a terminal phase; a paused scan and a cancel request
 * that has not landed yet still occupy it. Nothing is persisted: an application
 * restart starts with no scan.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { BroadcastMessage, KernelContext } from 'cordis-app/server'
import { ApiError } from '../library/errors.ts'
import { guarded, optionalId, readJson, sendJson } from '../library/http.ts'
import type { LibraryStore } from '../library/store.ts'
import {
  CONTROL,
  initialProgress,
  type ScanPhase,
  type ScanProgress,
  type ScanStartMessage,
  type ScanStatus,
  type ScanWorkerMessage,
} from './types.ts'

export interface ScanOptions {
  store: LibraryStore
  /** Directory holding `library.db`; the worker opens its own connection. */
  dataDir: string
  /** Progress publisher. Defaults to the `scan` channel on `ctx.ws`. */
  broadcast?: (channel: string, message: BroadcastMessage) => void
}

export interface ScanController {
  /** Whether the slot is occupied: running, paused, or a cancel is in flight. */
  isActive(): boolean
  dispose(): void
}

interface Session {
  state: ScanProgress
  control: Int32Array
  buffer: SharedArrayBuffer
  worker: Worker
  /** The phase to restore when a paused scan resumes. */
  resumePhase: ScanPhase
  cancelling: boolean
}

export function installScan(ctx: KernelContext, options: ScanOptions): ScanController {
  const publish =
    options.broadcast ??
    ((channel: string, message: BroadcastMessage) => ctx.ws.broadcast(channel, message))
  const controller = createController(options.store, options.dataDir, publish)

  ctx.router.post(
    '/api/scan',
    guarded(async (req, res) => {
      const body = await readJson(req)
      const input = body as { spaceId?: unknown } | undefined
      const spaceId = options.store.resolveSpaceId(optionalId(input?.spaceId))
      sendJson(res, 202, { scanId: controller.start(spaceId) })
    }),
  )

  ctx.router.get(
    '/api/scan/status',
    guarded(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const spaceId = options.store.resolveSpaceId(optionalId(url.searchParams.get('spaceId')))
      sendJson(res, 200, controller.status(spaceId))
    }),
  )

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    ctx.router.post(
      `/api/scan/:id/${action}`,
      guarded(async (_req, res, params) => {
        const state = controller[action](params.id ?? '')
        sendJson(res, 202, { scanId: state.scanId, phase: state.phase })
      }),
    )
  }

  ctx.effect(() => () => controller.dispose())
  return controller
}

interface Controller extends ScanController {
  start(spaceId: number): string
  status(spaceId: number): ScanStatus
  pause(scanId: string): ScanProgress
  resume(scanId: string): ScanProgress
  cancel(scanId: string): ScanProgress
}

function createController(
  store: LibraryStore,
  dataDir: string,
  publish: (channel: string, message: BroadcastMessage) => void,
): Controller {
  let current: Session | null = null
  let last: ScanProgress | null = null

  const publishState = (state: ScanProgress): void => {
    publish('scan', { type: 'scan', data: state })
  }

  const finish = (state: ScanProgress): void => {
    current = null
    last = state
    publishState(state)
  }

  const fail = (session: Session): void => {
    if (current !== session) return
    finish({ ...session.state, phase: 'failed' })
    void session.worker.terminate()
  }

  const requireSession = (scanId: string): Session => {
    if (!current || current.state.scanId !== scanId) {
      throw new ApiError(404, 'scan.not_found', 'Scan does not exist')
    }
    return current
  }

  return {
    start(spaceId) {
      if (current) {
        throw new ApiError(409, 'scan.already_active', 'A scan is already using the library')
      }

      const roots = store.listDirectories(spaceId).map((directory) => directory.path)
      const scanId = randomUUID()
      const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      const worker = new Worker(workerUrl())
      const session: Session = {
        state: initialProgress(scanId, spaceId),
        control: new Int32Array(buffer),
        buffer,
        worker,
        resumePhase: 'discovering',
        cancelling: false,
      }
      current = session

      worker.on('message', (message: ScanWorkerMessage) => {
        if (current !== session) return
        if (message.type === 'progress') {
          // A worker that has not reached its checkpoint yet may still send
          // progress after the pause was accepted; the phase is the main
          // thread's answer until the worker actually parks.
          session.state =
            session.state.phase === 'paused'
              ? { ...message.state, phase: 'paused' }
              : message.state
          publishState(session.state)
          return
        }
        finish(message.state)
      })
      worker.on('error', () => fail(session))
      worker.on('exit', () => {
        // Final messages are delivered before `exit`, but let the queued ones
        // drain first so a clean `done` is never mistaken for a crash.
        setImmediate(() => fail(session))
      })

      const start: ScanStartMessage = {
        type: 'start',
        scanId,
        spaceId,
        dbPath: join(dataDir, 'library.db'),
        roots,
        control: buffer,
      }
      worker.postMessage(start)
      publishState(session.state)
      return scanId
    },

    status(spaceId) {
      if (current && current.state.spaceId === spaceId) {
        return { active: true, ...current.state }
      }
      if (last && last.spaceId === spaceId) return { active: false, ...last }
      return { active: false }
    },

    pause(scanId) {
      const session = requireSession(scanId)
      if (session.cancelling) {
        throw new ApiError(409, 'scan.cancelling', 'The scan is being cancelled')
      }
      if (session.state.phase === 'paused') {
        throw new ApiError(409, 'scan.not_running', 'The scan is already paused')
      }
      session.resumePhase = session.state.phase
      Atomics.store(session.control, 0, CONTROL.pause)
      Atomics.notify(session.control, 0)
      session.state = { ...session.state, phase: 'paused' }
      publishState(session.state)
      return session.state
    },

    resume(scanId) {
      const session = requireSession(scanId)
      // A cancel that is still landing has already won the control word; running
      // again would overwrite it and leave the worker walking a doomed scan.
      if (session.cancelling) {
        throw new ApiError(409, 'scan.cancelling', 'The scan is being cancelled')
      }
      if (session.state.phase !== 'paused') {
        throw new ApiError(409, 'scan.not_paused', 'The scan is not paused')
      }
      Atomics.store(session.control, 0, CONTROL.run)
      Atomics.notify(session.control, 0)
      session.state = { ...session.state, phase: session.resumePhase }
      publishState(session.state)
      return session.state
    },

    cancel(scanId) {
      const session = requireSession(scanId)
      session.cancelling = true
      Atomics.store(session.control, 0, CONTROL.cancel)
      Atomics.notify(session.control, 0)
      return session.state
    },

    isActive() {
      return current !== null
    },

    dispose() {
      if (current) {
        void current.worker.terminate()
        current = null
      }
    },
  }
}

/**
 * Locate the worker entry.
 *
 * In a build the controller is bundled into `dist/server/index.js`, so the
 * worker sits next to it. Tests import the TypeScript sources directly, where
 * the entry is one directory up and still has its `.ts` extension; Node 24
 * strips types for workers too, so that form runs without a separate build.
 */
function workerUrl(): URL {
  const candidates = [
    new URL('./scan-worker.js', import.meta.url),
    new URL('../scan-worker.js', import.meta.url),
    new URL('../scan-worker.ts', import.meta.url),
    new URL('./scan-worker.ts', import.meta.url),
  ]
  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) return candidate
  }
  throw new Error('scan-worker entry not found')
}
