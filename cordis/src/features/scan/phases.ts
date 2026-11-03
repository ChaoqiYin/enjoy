/** The scan phases the dialog distinguishes, and the ones that end the pass. */

import type { ScanPhase } from '../../shared/api'

const TERMINAL: ReadonlySet<ScanPhase> = new Set(['done', 'cancelled', 'failed'])

export function isTerminalPhase(phase: ScanPhase): boolean {
  return TERMINAL.has(phase)
}

/** The translation key for a phase the dialog can show. */
export function phaseLabelKey(phase: ScanPhase | undefined): string {
  switch (phase) {
    case 'indexing':
      return 'scanPhaseIndexing'
    case 'metadata':
      return 'scanPhaseMetadata'
    case 'thumbnails':
      return 'scanPhaseThumbnails'
    case 'paused':
      return 'scanPhasePaused'
    case 'discovering':
    default:
      return 'scanPhaseDiscovering'
  }
}
