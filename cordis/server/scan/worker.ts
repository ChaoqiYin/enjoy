/** The scan thread: discovery, the differential write, then the (placeholder) media phases. */

import { parentPort, type MessagePort } from 'node:worker_threads'
import { openDatabase } from '../library/db.ts'
import { ScanCancelled, ScanControl } from './control.ts'
import { indexScan } from './indexer.ts'
import { initialProgress, type ScanStartMessage, type ScanWorkerMessage } from './types.ts'
import { discover } from './walker.ts'

/** Progress is coalesced at this interval; phase changes are always sent. */
const PROGRESS_INTERVAL_MS = 100

export function startScanWorker(): void {
  const port = parentPort
  if (!port) throw new Error('scan-worker must run in a worker thread')
  port.once('message', (message: ScanStartMessage) => {
    void run(message, port)
  })
}

async function run(message: ScanStartMessage, port: MessagePort): Promise<void> {
  const control = new ScanControl(message.control)
  const state = initialProgress(message.scanId, message.spaceId)
  let lastEmit = 0

  const emit = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return
    lastEmit = now
    post(port, { type: 'progress', state })
  }

  const setPhase = (phase: typeof state.phase): void => {
    state.phase = phase
    emit(true)
  }

  const db = openDatabase(message.dbPath)
  try {
    emit(true)
    const discovery = discover(message.roots, control, {
      onEntry(path) {
        state.currentPath = path
        emit()
      },
    })
    state.discovered = discovery.discovered
    state.failures = discovery.failures
    state.unreachableDirectories = discovery.unreachableDirectories

    setPhase('indexing')
    const result = indexScan(db, message.spaceId, discovery.roots, control, {
      onIndexed(file, indexed) {
        state.processed = indexed
        state.indexed = indexed
        state.currentPath = file.path
        emit()
      },
    })
    state.changes = result.changes

    // Media work belongs to the thumbnails task (#114). The phases and their
    // counters exist now so the dialog and the progress message do not change
    // shape when it lands.
    setPhase('metadata')
    setPhase('thumbnails')

    state.phase = 'done'
    post(port, { type: 'done', state })
  } catch (error) {
    if (error instanceof ScanCancelled) {
      state.phase = 'cancelled'
      post(port, { type: 'cancelled', state })
    } else {
      state.phase = 'failed'
      post(port, { type: 'failed', state, error: String(error) })
    }
  } finally {
    db.close()
    port.close()
  }
}

function post(port: MessagePort, message: ScanWorkerMessage): void {
  port.postMessage(message)
}
