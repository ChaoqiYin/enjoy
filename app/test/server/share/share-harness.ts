/**
 * Share-control fixture: a real library, a real share controller and real HTTP
 * routes, with the WebDAV listener on an ephemeral port.
 *
 * `startPort: 0` is what tests use so two of them cannot collide on 4918; the
 * port-exhaustion case pins a base explicitly.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KernelContext } from 'cordis-app/server'
import { installLibrary } from '../../../server/library/index.ts'
import {
  installShare,
  type ShareController,
  type ShareInstallOptions,
} from '../../../server/share/control.ts'
import type { DeviceActivity } from '../../../server/share/devices.ts'
import type { NetworkInterfaces } from '../../../server/share/addresses.ts'
import { startHarness, type Harness } from '../library/test-harness.ts'

export interface SharingOptions {
  /** Reuse a data directory; the caller then owns its cleanup. */
  dataDir?: string
  /** First port to try. Default 0, which asks the OS for a free one. */
  startPort?: number
  networkInterfaces?: () => NetworkInterfaces
  activity?: DeviceActivity
  /** Remove the data directory on close (default true). */
  removeDataDir?: boolean
}

export interface SharingLibrary {
  harness: Harness
  dataDir: string
  controller: ShareController
  close(): Promise<void>
}

/** A video file on disk, created with its parent directory. */
export function makeVideoFile(directory: string, name: string, contents = 'video'): string {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, name)
  writeFileSync(path, contents)
  return path
}

/** Start the library and the share controller over one throwaway data directory. */
export async function openSharingLibrary(
  options: SharingOptions = {},
): Promise<SharingLibrary> {
  const removeDataDir = options.removeDataDir ?? true
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'enjoy-cordis-share-'))
  let controller: ShareController | undefined

  const shareOptions: Omit<ShareInstallOptions, 'store' | 'videos'> = {
    startPort: options.startPort ?? 0,
    networkInterfaces: options.networkInterfaces,
    activity: options.activity,
  }

  const harness = await startHarness((ctx) => {
    const library = installLibrary(ctx as unknown as KernelContext, {
      dataDir,
      isScanActive: () => false,
      beforeSpaceChange: (change) => controller?.beforeSpaceChange(change) ?? Promise.resolve(),
    })
    controller = installShare(ctx as unknown as KernelContext, {
      store: library.store,
      videos: library.videos,
      ...shareOptions,
    })
  })

  return {
    harness,
    dataDir,
    controller: controller!,
    async close() {
      await controller?.close().catch(() => undefined)
      await harness.close()
      if (removeDataDir) rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** Bind one port on every interface; used to make a run of ports unavailable. */
function listenOn(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.()
  return new Promise((resolve) => server.close(() => resolve()))
}

/**
 * Occupy a run of consecutive ports, returning the first one.
 *
 * The base is picked by the operating system and then re-bound as a run, so a
 * number written down in the test cannot be one the machine already uses.
 */
export async function occupyPortRun(
  length: number,
): Promise<{ base: number; release(): Promise<void> }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let base: number
    try {
      const probe = await listenOn(0)
      base = (probe.address() as { port: number }).port
      await closeServer(probe)
    } catch {
      continue
    }
    if (base + length - 1 > 65535) continue

    const servers: Server[] = []
    let complete = true
    for (let offset = 0; offset < length; offset += 1) {
      try {
        servers.push(await listenOn(base + offset))
      } catch {
        complete = false
        break
      }
    }
    // The first port of the run must still be the one the system chose. A
    // different service may have taken it between the probe and the binds.
    if (complete) {
      return {
        base,
        release: async () => {
          await Promise.all(servers.map(closeServer))
        },
      }
    }
    await Promise.all(servers.map(closeServer))
  }
  throw new Error(`could not occupy ${length} consecutive ports`)
}

/** Whether a port can be bound again; false means the listener is still there. */
export function canBind(port: number): Promise<boolean> {
  return listenOn(port).then(
    async (server) => {
      await closeServer(server)
      return true
    },
    () => false,
  )
}

/** The Basic header a WebDAV client would send. */
export function basic(password: string, username = 'enjoy'): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

export async function webdavRequest(
  port: number,
  method: string,
  path: string,
  options: { password?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers }
  if (options.password !== undefined) headers.authorization = basic(options.password)
  return fetch(`http://127.0.0.1:${port}${path}`, { method, headers })
}
