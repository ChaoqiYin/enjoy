import type { ScanStatus } from '../../shared/api';

/** How long a clean completion notice stays before it closes itself. */
export const COMPLETION_NOTICE_MS = 3000;

export function shouldAnnounceScan(status: ScanStatus): boolean {
  return (
    status.phase === 'complete' &&
    (!status.background ||
      status.failures > 0 ||
      Object.values(status.changes).some((count) => count > 0))
  );
}

/**
 * A completion that reported failures waits for the user instead of closing
 * itself: the failure count is the part worth acting on, and it is exactly the
 * part a three-second timer takes away before it can be read.
 */
export function completionAutoCloseMs(status: ScanStatus): number | undefined {
  return status.failures > 0 ? undefined : COMPLETION_NOTICE_MS;
}
