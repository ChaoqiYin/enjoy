import type { UseQueryResult } from '@tanstack/react-query';
import type { ScanStatus } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * Whether a pass is running, what it is doing, and how to steer it.
 *
 * The boolean is the point of the module: most of what asks is not showing the
 * progress — it is deciding whether a command may be started at all, and it
 * should not have to know what a scan status is to ask.
 *
 * `isRunning` is derived in the assembly rather than here, because the type
 * below is what this module owns and a derivation here would be a second place
 * that decides what the slice holds. The rule itself is `isScanRunning`, which
 * has a module of its own.
 */
export type Scan = {
  status: ScanStatus | undefined;
  isRunning: boolean;
  controlScan: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
};

export function useScan(): Scan {
  return useLibraryContext().scan;
}
