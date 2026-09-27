import { useLibraryContext } from './LibraryProvider';

/**
 * Everything the library has to say: a failure worth reading, a completed scan
 * worth announcing, and a short hint that an action landed.
 */
export function useNotices() {
  const {
    error,
    retryError,
    setError,
    completion,
    dismissCompletion,
    copyHint,
    showCopyHint,
    dismissCopyHint,
  } = useLibraryContext();
  return {
    error,
    retryError,
    setError,
    completion,
    dismissCompletion,
    copyHint,
    showCopyHint,
    dismissCopyHint,
  };
}
