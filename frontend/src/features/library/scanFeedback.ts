import type { ScanStatus } from '../../shared/api';

/** How long a clean completion notice stays before it closes itself. */
export const COMPLETION_NOTICE_MS = 3000;

/**
 * Whether a media task is holding the single scan slot.
 *
 * Scans and thumbnail regeneration share that slot and report through the same
 * status, so both read as running here. Callers use this to avoid starting
 * something that would compete with it — the update flow will not offer to
 * restart while a pass is in flight, because installing exits the process and
 * that pass would be lost.
 */
export function isScanRunning(status: ScanStatus | undefined): boolean {
  return (
    status !== undefined &&
    ['discovering', 'processing', 'paused'].includes(status.phase)
  );
}

export function shouldAnnounceScan(status: ScanStatus): boolean {
  return (
    status.phase === 'complete' &&
    (!status.background ||
      status.failures > 0 ||
      status.unreachableDirectories > 0 ||
      Object.values(status.changes).some((count) => count > 0))
  );
}

/**
 * A completion that reported failures waits for the user instead of closing
 * itself: the failure count is the part worth acting on, and it is exactly the
 * part a three-second timer takes away before it can be read.
 *
 * Unreachable directories are announced but do not extend the stay. They are a
 * fact about this scan's range rather than something to act on, and ADR 0003
 * accepts the cost that they are then no longer visible after the notice goes.
 */
export function completionAutoCloseMs(status: ScanStatus): number | undefined {
  return status.failures > 0 ? undefined : COMPLETION_NOTICE_MS;
}
