import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Video } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Spinner } from '../../shared/ui/spinner';

/**
 * One of the panel's file-maintenance actions: the two that ask the backend to
 * look at this file again, rather than at the whole library.
 *
 * The colour is the caller's to choose, because the two are not equally heavy —
 * rebuilding one preview is the quiet one, and the drawing gives both the same
 * neutral surface. `size="sm"` is the rule for a labelled button that is not
 * the library's own add/scan pair, and the glyph is the 14-pixel one that goes
 * with it.
 *
 * Waiting is drawn in place of the glyph rather than beside the label: the
 * button keeps its width and its name, and what changed is the one thing the
 * press changed. Reporting is the caller's: every call site routes the action
 * through the library's `run`, which records the failure and puts it on screen.
 * Catching here is what keeps a rejection from reaching the runtime as an
 * unhandled one — all this button owns is the busy state.
 */
export function MaintenanceButton({
  video,
  action,
  variant,
  icon,
  label,
  disabled = false,
}: {
  video: Video;
  action: (video: Video) => void | Promise<unknown>;
  variant: 'primary' | 'secondary';
  icon: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        void Promise.resolve(action(video))
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      {busy ? <Spinner aria-hidden="true" /> : icon}
      {label}
    </Button>
  );
}
