import type { ScanStatus } from '../../shared/api';

export function shouldAnnounceScan(status: ScanStatus): boolean {
  return (
    status.phase === 'complete' &&
    (!status.background ||
      status.failures > 0 ||
      Object.values(status.changes).some((count) => count > 0))
  );
}
