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
import { installLibrary } from '../library/index.ts'
import { startHarness, type Harness } from '../library/test-harness.ts'
import { installScan, type ScanController } from './index.ts'

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
