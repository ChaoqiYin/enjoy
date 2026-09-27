import type { AppError, ScanStatus } from '../../shared/api';
import { useLibraryContext } from './LibraryProvider';

/**
 * Everything the library has to say: a failure worth reading, a completed scan
 * worth announcing, and a short hint that an action landed.
 *
 * Eight keys, and they are the eight this consumer needs. That number is what a
 * test double has to carry, and it is read off this type rather than counted out
 * of the assembly by hand — a frame that renders the notices names these eight
 * things and no others.
 */
export type Notices = {
  error: AppError | null;
  retryError: (() => Promise<unknown>) | undefined;
  setError: (value: AppError | null) => void;
  completion: ScanStatus | null;
  dismissCompletion: () => void;
  copyHint: boolean;
  showCopyHint: () => void;
  dismissCopyHint: () => void;
};

export function useNotices(): Notices {
  return useLibraryContext().notices;
}
