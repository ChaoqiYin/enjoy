import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLatestRef } from './useLatestRef';
import { useNotificationHost } from './useNotificationHost';

/**
 * How long a short hint stays. A glance is all it takes to read one, so this
 * is short on purpose — anything worth more time is a notice, not a hint.
 */
export const HINT_MS = 1000;

/**
 * A short confirmation for an action whose result the user cannot see. Copying
 * a path is the one such action the application has: nothing on screen changes,
 * so without this the click looks like it did nothing.
 *
 * It is deliberately not a notice, and shares none of one's parts. It carries
 * no type, so it is neutral rather than coloured; no close button, because
 * there is nothing to decide; and no countdown, because a line draining over
 * one second is a flicker rather than information. It sits at the middle of the
 * top edge instead of the corner, and it is silent to assistive technology: a
 * notice is something to read and act on, and this is not.
 *
 * What it does share with a notice is the host, and that is the point — the
 * portal, the move into an open dialog and the refcounting are written once.
 *
 * The block swallows clicks for the second it is up rather than letting them
 * through, so a click under it can never land on a control the user cannot see.
 * That is the default behaviour of a positioned element, so nothing here asks
 * for it; adding `pointer-events-none` would be the change, and it would hand
 * the click to whatever the hint is covering.
 *
 * It appears with no entrance of its own, and that is also on purpose: the
 * carriers a hint could borrow from — a notice's alert, a library's toast —
 * animate a quarter of a second in, which is a quarter of this hint's life. The
 * neutral surface is drawn here rather than taken from `Alert` for the same
 * reason, along with the role that alert would have announced.
 */
export function Hint({ text, onClose }: { text: string; onClose: () => void }) {
  const host = useNotificationHost('center');
  const close = useLatestRef(onClose);
  useEffect(() => {
    const timer = setTimeout(() => close.current(), HINT_MS);
    return () => clearTimeout(timer);
  }, [close]);
  if (!host) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
    >
      <Check className="size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>,
    host,
  );
}
