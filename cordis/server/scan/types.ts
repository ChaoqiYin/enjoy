/** Scan state, progress messages and the shared control word. */

export type ScanPhase =
  | 'discovering'
  | 'indexing'
  | 'metadata'
  | 'thumbnails'
  | 'paused'
  | 'done'
  | 'cancelled'
  | 'failed'

/** The phases in which a scan is running rather than waiting or finished. */
export const ACTIVE_PHASES = ['discovering', 'indexing', 'metadata', 'thumbnails'] as const

export interface ScanChanges {
  added: number
  updated: number
  removed: number
}

/** One progress snapshot, shared by the WS message, the status endpoint and the worker. */
export interface ScanProgress {
  scanId: string
  spaceId: number
  phase: ScanPhase
  changes: ScanChanges
  failures: number
  unreachableDirectories: number
  discovered: number
  processed: number
  indexed: number
  metadataReady: number
  thumbnailsReady: number
  currentPath: string
}

/** `GET /api/scan/status`; `active` says whether the scan slot is occupied. */
export interface ScanStatus extends Partial<Omit<ScanProgress, 'scanId'>> {
  active: boolean
  scanId?: string
}

/** Control word values on the shared `Int32Array`. */
export const CONTROL = { run: 0, pause: 1, cancel: 2 } as const

/** What the slot is being used for: a full scan, or a thumbnail rebuild. */
export type ScanMode = 'scan' | 'thumbnails'

export interface ScanStartMessage {
  type: 'start'
  scanId: string
  spaceId: number
  dbPath: string
  roots: string[]
  control: SharedArrayBuffer
  mode: ScanMode
}

/**
 * What the worker reports back.
 *
 * There is no `paused` message: the worker parks inside a checkpoint rather
 * than returning to its loop, so the main thread owns the paused phase.
 */
export interface ScanWorkerMessage {
  type: 'progress' | 'done' | 'cancelled' | 'failed'
  state: ScanProgress
  error?: string
}

export interface DiscoveredFile {
  path: string
  fileName: string
  folderPath: string
  fileSize: number
  modifiedAt: number
}

/**
 * What one configured directory turned out to be.
 *
 * `gone` clears its records; `unreachable` and `not-a-directory` keep them,
 * because this run learned nothing about what the path holds.
 */
export type RootVerdict = 'read' | 'gone' | 'unreachable' | 'not-a-directory'

export interface RootScan {
  path: string
  verdict: RootVerdict
  files: DiscoveredFile[]
  /** Paths that failed this run although they are still on disk; their records stay. */
  unreadable: string[]
}

/** Default empty counters for a scan that has just started. */
export function initialProgress(scanId: string, spaceId: number): ScanProgress {
  return {
    scanId,
    spaceId,
    phase: 'discovering',
    changes: { added: 0, updated: 0, removed: 0 },
    failures: 0,
    unreachableDirectories: 0,
    discovered: 0,
    processed: 0,
    indexed: 0,
    metadataReady: 0,
    thumbnailsReady: 0,
    currentPath: '',
  }
}
