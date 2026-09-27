import { useCallback, useState } from 'react';
import type { AppError, ScanStatus } from '../../shared/api';

/** A failure the interface has to read, and how to try the thing again. */
export type LibraryFailure = {
  error: AppError;
  retry?: () => Promise<unknown>;
};

/**
 * Everything the library has to *say* to the user, as opposed to what it holds.
 *
 * Three kinds of thing, and they are deliberately three: a failure worth an
 * error notice, a completed scan worth a toast, and a short hint that an action
 * landed. A hint is not a notice and does not take the notice slot — it tells
 * the user something happened rather than something to read and act on. See the
 * development guide.
 *
 * The query errors are the fourth: a query that failed has an error of its own,
 * and dismissing a notice dismisses those too, so the set that was dismissed has
 * to be held somewhere.
 *
 * The setters are stable because the scan lifecycle's event subscriptions are
 * built once and hold on to them; a new identity every render would tear those
 * subscriptions down and build them again.
 */
export function useNoticeState() {
  const [failure, setFailure] = useState<LibraryFailure | null>(null);
  const [completion, setCompletion] = useState<ScanStatus | null>(null);
  const [copyHint, setCopyHint] = useState(false);
  const [dismissedQueryErrors, setDismissedQueryErrors] = useState<unknown[]>(
    [],
  );
  const setError = useCallback(
    (error: AppError | null, retry?: () => Promise<unknown>) => {
      setFailure(error ? { error, retry } : null);
    },
    [],
  );
  const dismissCompletion = useCallback(() => setCompletion(null), []);
  const showCopyHint = useCallback(() => setCopyHint(true), []);
  const dismissCopyHint = useCallback(() => setCopyHint(false), []);
  const dismissQueryErrors = useCallback(
    (errors: unknown[]) => setDismissedQueryErrors(errors),
    [],
  );
  return {
    failure,
    setError,
    completion,
    setCompletion,
    dismissCompletion,
    copyHint,
    showCopyHint,
    dismissCopyHint,
    dismissedQueryErrors,
    dismissQueryErrors,
  };
}
