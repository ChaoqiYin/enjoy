import { useState } from 'react';
import { normalizeError } from './api';
import type { AppError } from './api';

/**
 * One command, run once, and how it ended: busy while it runs, and the failure
 * it produced — kept together with the value the command was attempted with,
 * because a retry has to repeat that value rather than read the current one.
 *
 * The shape was written out at every call site that had a command of its own:
 * raise a flag, clear the last failure, await, normalize what was thrown, put it
 * somewhere, lower the flag whichever way it went. Each copy named its flag
 * after its own screen (`saving`, `choosing`, `checking`, `downloading`), which
 * is fair — those are different screens — but the rule in the middle was the
 * same six lines each time, and the two that move on success had to remember
 * that the move belongs *inside* the action, since this swallows the failure.
 *
 * What it does not own is where a failure is shown, because there are two right
 * answers and they are decided by what the user is looking at. Passing
 * `onFailure` hands it to a notice at the corner of the screen, which is for a
 * failure about the library as a whole — the control that caused it is gone by
 * then. Leaving it out keeps it in `failure` for the caller to render where the
 * value was typed or picked, which is where the answer belongs when the surface
 * that asked is still open.
 */
export function useCommand<V = undefined>(
  onFailure?: (error: AppError) => void,
) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: AppError; value: V } | null>(
    null,
  );
  async function run(value: V, action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (cause) {
      const error = normalizeError(cause);
      if (onFailure) onFailure(error);
      else setFailure({ error, value });
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    failure,
    // The same clearing `run` does at its start, for the close button of
    // whatever renders the failure.
    dismissFailure: () => setFailure(null),
    run,
  };
}
