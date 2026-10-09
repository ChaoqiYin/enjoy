import { CheckCircle, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { useExclusiveNotice, useNotificationHost } from './useNotificationHost';
import { useNoticeCountdown } from './useNoticeCountdown';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

// The colour is named per type and written out in full, never built from the
// type: Tailwind only generates the utilities it can see as literal strings, so
// an interpolated `bg-${type}/10` would render an uncoloured notice. That rule
// outlives the carrier it was first written for — daisyUI's `alert-${type}` was
// the same trap — and it is why the table names an `Alert` variant instead of a
// tone: the variant is a literal, and it is the carrier that decides what the
// literal is worth. Errors wear `destructive`, which is the name shadcn gives
// that slot; the type vocabulary stays the four names the rest of the app
// speaks.
//
// The countdown is a hairline on the frame's own bottom edge, not a progress
// bar under the text. A full-width bar in the body reads as task progress, and
// this notice is not reporting progress — it is running out of time; on the
// frame's edge the body stays plain text and the shrinking line belongs to the
// notice rather than to its content. Drawing it in the frame's own foreground
// also settles the colour: a tone-coloured fill would take the tone the frame
// is already made of and vanish into it, which is what the previous bar had to
// work around.
//
// `exclusive` marks the types that share the single non-error slot. Errors are
// exempt: they neither displace another notice nor are displaced by one, and
// stay on screen until the user deals with them or retries successfully.
const toastTypes = {
  success: {
    icon: CheckCircle,
    role: 'status',
    variant: 'success',
    exclusive: true,
  },
  error: {
    icon: CircleAlert,
    role: 'alert',
    variant: 'destructive',
    exclusive: false,
  },
  info: {
    icon: Info,
    role: 'status',
    variant: 'info',
    exclusive: true,
  },
  warning: {
    icon: TriangleAlert,
    role: 'status',
    variant: 'warning',
    exclusive: true,
  },
} as const;

type ToastProps = {
  type: ToastType;
  closeLabel: string;
  onClose: () => void;
  /** Omit to keep the notice until the user closes it. */
  autoCloseMs?: number;
  children: ReactNode;
};

/**
 * The frame every floating notice shares: portal, notification host, the alert
 * carrier's colours, type icon, close button and — when the caller gives a
 * duration — a countdown with its progress bar and its hover/focus hold. The
 * type decides the colours, the icon and how assertively the notice is
 * announced; the caller supplies the body, its actions and how long it stays,
 * so nothing here assumes what a notice contains.
 *
 * The carrier is `Alert`, and a notice is the floating twin of one: same
 * surface, same tone per variant, same icon slot. What the notice adds is the
 * way it arrives — in a shared host rather than in the page — and what it takes
 * away is the announcement it does not always want: an alert interrupts, so
 * only the error type keeps `role="alert"` and the rest are status messages.
 */
export function Toast({
  type,
  closeLabel,
  onClose,
  autoCloseMs,
  children,
}: ToastProps) {
  const { icon: Icon, role, variant, exclusive } = toastTypes[type];
  const host = useNotificationHost('end');
  const countdown = useNoticeCountdown(autoCloseMs, onClose);
  useExclusiveNotice(exclusive, onClose);
  if (!host) return null;
  const { indicator } = countdown;
  return createPortal(
    <Alert
      role={role}
      variant={variant}
      // The carrier lays its two children out in a grid of icon and body. A
      // notice has a third — the close button — and a grid would give it a row
      // of its own under the icon, so the row is restated as a flex one and the
      // body takes the space that is left.
      className="pointer-events-auto flex items-start gap-2 shadow-lg"
      {...countdown.pauseProps}
    >
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>
      {indicator && (
        // Hidden from assistive technology on purpose: a countdown that
        // announces itself makes a screen reader report every step of a timer
        // the user did not ask to hear.
        //
        // The clipping sits on a full-size wrapper rather than on the notice,
        // because `overflow-hidden` on the notice would swallow the close
        // button's focus outline. Only the hairline needs the corners rounded
        // away, and it takes the carrier's own radius rather than restating it.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-current opacity-25" />
          <span
            // The line is drawn full width and scaled down, rather than
            // narrowed step by step: a `transform` animation is the engine's to
            // run on the compositor, so the line drains smoothly whatever the
            // main thread is doing. The `@keyframes` live in `style.css`; only
            // parts that change at run time are here.
            //
            // A different duration is a different notice in this slot, so the
            // key replaces the line and its animation starts from the top. The
            // same duration arriving again — a scan reporting its completion
            // twice — keeps this element, and a running animation is not
            // restarted by re-rendering it.
            key={indicator.durationMs}
            data-notice-countdown=""
            className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-current"
            style={{
              animationName: 'notice-countdown',
              animationDuration: `${indicator.durationMs}ms`,
              animationTimingFunction: 'linear',
              // The line must stay drained for the moment between the time
              // running out and the notice leaving, instead of springing back
              // to full width.
              animationFillMode: 'forwards',
              animationPlayState: indicator.held ? 'paused' : 'running',
            }}
          />
        </span>
      )}
    </Alert>,
    host,
  );
}
