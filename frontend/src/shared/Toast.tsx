import { CheckCircle, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useExclusiveNotice, useNotificationHost } from './useNotificationHost';
import { useNoticeCountdown } from './useNoticeCountdown';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Class names are written out in full and never interpolated: Tailwind only
// generates the utilities it can see as literal strings, so a built-up
// `alert-${type}` would render an uncoloured alert.
//
// The frame is the solid alert with `alert-soft` layered back on in the dark
// theme. A soft alert colours its text with the tone itself, which on the light
// theme's near-white tint lands near 2.6:1 — and the countdown is drawn in that
// same colour. Dark tints sit on a dark base and clear 3:1, so the softer look
// is kept there.
//
// The countdown is a hairline on the frame's own bottom edge, not a daisyUI
// `.progress` bar under the text. A full-width bar in the body reads as task
// progress, and this notice is not reporting progress — it is running out of
// time; on the frame's edge the body stays plain text and the shrinking line
// belongs to the notice rather than to its content. Drawing it in the frame's
// own foreground also settles the colour: a `progress-{type}` fill would take
// the tone the solid frame is already made of and vanish into it, which is what
// the previous bar had to work around.
//
// `exclusive` marks the types that share the single non-error slot. Errors are
// exempt: they neither displace another notice nor are displaced by one, and
// stay on screen until the user deals with them or retries successfully.
const toastTypes = {
  success: {
    icon: CheckCircle,
    role: 'status',
    frame: 'alert alert-success dark:alert-soft',
    exclusive: true,
  },
  error: {
    icon: CircleAlert,
    role: 'alert',
    frame: 'alert alert-error dark:alert-soft',
    exclusive: false,
  },
  info: {
    icon: Info,
    role: 'status',
    frame: 'alert alert-info dark:alert-soft',
    exclusive: true,
  },
  warning: {
    icon: TriangleAlert,
    role: 'status',
    frame: 'alert alert-warning dark:alert-soft',
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
 * The frame every floating notice shares: portal, notification host, native
 * daisyUI alert colours, type icon, close button and — when the caller gives a
 * duration — a countdown with its progress bar and its hover/focus hold. The
 * type decides the colours, the icon and how assertively the notice is
 * announced; the caller supplies the body, its actions and how long it stays,
 * so nothing here assumes what a notice contains.
 */
export function Toast({
  type,
  closeLabel,
  onClose,
  autoCloseMs,
  children,
}: ToastProps) {
  const { icon: Icon, role, frame, exclusive } = toastTypes[type];
  const host = useNotificationHost();
  const countdown = useNoticeCountdown(autoCloseMs, onClose);
  useExclusiveNotice(exclusive, onClose);
  if (!host) return null;
  const { progress } = countdown;
  return createPortal(
    <section
      role={role}
      className={`alert ${frame} alert-vertical sm:alert-horizontal shadow-lg pointer-events-auto text-left relative`}
      {...countdown.pauseProps}
    >
      <Icon size={24} className="shrink-0" aria-hidden="true" />
      <div className="min-w-0 w-full space-y-1">{children}</div>
      <button
        className="btn btn-outline btn-xs btn-square btn-neutral self-start"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
      {progress && progress.max > 0 && (
        // Hidden from assistive technology on purpose: a countdown that
        // announces itself makes a screen reader report every step of a timer
        // the user did not ask to hear.
        //
        // The clipping sits on a full-size wrapper rather than on the section,
        // because `overflow-hidden` on the section would swallow the close
        // button's focus outline. Only the hairline needs rounding away.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-box"
        >
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-current opacity-25" />
          <span
            data-notice-countdown=""
            className="absolute bottom-0 left-0 h-0.5 bg-current"
            style={{ width: `${(progress.value / progress.max) * 100}%` }}
          />
        </span>
      )}
    </section>,
    host,
  );
}
