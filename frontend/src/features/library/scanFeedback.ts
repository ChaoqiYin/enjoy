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

/**
 * Whether a status is a pass worth announcing.
 *
 * Only a pass that **finished** is. A pass that was cancelled or that failed
 * leaves the phase it stopped in — `ScanGuard::drop` decides that on the
 * backend — and there is nothing to tell the user about a sweep they already
 * watched stop. Every scan is user-initiated, so there is no such thing as one
 * the user did not ask for and should not be interrupted by; the flag that used
 * to make that distinction went with the module that started those scans, and
 * what is left is the phase.
 */
export function shouldAnnounceScan(status: ScanStatus): boolean {
  return status.phase === 'complete';
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
