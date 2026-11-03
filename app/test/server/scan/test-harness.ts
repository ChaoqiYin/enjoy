/**
 * Scan test fixture: a real library, a real scan controller and a real worker
 * thread, driven only through HTTP.
 *
 * The broadcast collector stands in for `ctx.ws` so tests can see the progress
 * messages the controller publishes without opening a WebSocket.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KernelContext } from 'cordis-app/server'
import { installLibrary } from '../../../server/library/index.ts'
import { startHarness, type Harness } from '../library/test-harness.ts'
import { installScan, type ScanController } from '../../../server/scan/index.ts'

export interface Broadcast {
  channel: string
  message: { type: string; data?: unknown }
}

export interface ScanningLibrary {
  harness: Harness
  dataDir: string
  broadcasts: Broadcast[]
  close(): Promise<void>
}

/** A `GET /api/scan/status` answer, as much of it as the tests read. */
export interface ScanStatusBody {
  active: boolean
  scanId?: string
  spaceId?: number
  phase?: string
  changes?: { added: number; updated: number; removed: number }
  discovered?: number
  processed?: number
  indexed?: number
  metadataReady?: number
  thumbnailsReady?: number
  failures?: number
  unreachableDirectories?: number
}

const TERMINAL_PHASES = new Set(['done', 'cancelled', 'failed'])

/** Poll the status endpoint until the slot is free and a terminal phase is recorded. */
export async function waitForTerminal(
  library: ScanningLibrary,
  spaceId = 1,
  timeoutMs = 30_000,
): Promise<ScanStatusBody> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await library.harness.request(
      'GET',
      `/api/scan/status?spaceId=${spaceId}`,
    )
    const body = response.body as ScanStatusBody
    if (response.status === 200 && !body.active && body.phase && TERMINAL_PHASES.has(body.phase)) {
      return body
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('scan did not reach a terminal phase')
}

export async function openScanningLibrary(): Promise<ScanningLibrary> {
  const dataDir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-scan-'))
  const broadcasts: Broadcast[] = []
  let controller: ScanController | undefined

  const harness = await startHarness((ctx) => {
    const library = installLibrary(ctx as unknown as KernelContext, {
      dataDir,
      isScanActive: () => controller?.isActive() ?? false,
    })
    controller = installScan(ctx as unknown as KernelContext, {
      store: library.store,
      dataDir,
      broadcast: (channel, message) => broadcasts.push({ channel, message }),
    })
  })

  return {
    harness,
    dataDir,
    broadcasts,
    async close() {
      await harness.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
