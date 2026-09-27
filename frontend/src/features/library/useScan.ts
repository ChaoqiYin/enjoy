import { useLibraryContext } from './LibraryProvider';
import { isScanRunning } from './scanFeedback';

/**
 * Whether a pass is running, what it is doing, and how to steer it.
 *
 * The boolean is the point of the module: most of what asks is not showing the
 * progress — it is deciding whether a command may be started at all, and it
 * should not have to know what a scan status is to ask.
 */
export function useScan() {
  const { scan, controlScan } = useLibraryContext();
  return {
    status: scan.data,
    isRunning: isScanRunning(scan.data),
    controlScan,
  };
}
