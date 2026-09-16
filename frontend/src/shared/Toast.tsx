import { CheckCircle, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useExclusiveNotice, useNotificationHost } from './useNotificationHost';
import { useNoticeCountdown } from './useNoticeCountdown';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Class names are written out in full and never interpolated: Tailwind only
// generates the utilities it can see as literal strings, so a built-up
// `alert-${type}` would render an uncoloured alert. The progress colour is
// spelled out for the same reason, and is needed because daisyUI's `.progress`
// hardcodes `color: var(--color-base-content)` and so does not inherit the
// tone the alert gives its text.
// `exclusive` marks the types that share the single non-error slot. Errors are
// exempt: they neither displace another notice nor are displaced by one, and
// stay on screen until the user deals with them or retries successfully.
const toastTypes = {
  success: {
    icon: CheckCircle,
    role: 'status',
    frame: 'alert-soft alert-success',
    bar: 'progress-success',
    exclusive: true,
  },
  error: {
    icon: CircleAlert,
    role: 'alert',
    frame: 'alert-soft alert-error',
    bar: 'progress-error',
    exclusive: false,
  },
  info: {
    icon: Info,
    role: 'status',
    frame: 'alert-soft alert-info',
    bar: 'progress-info',
    exclusive: true,
  },
  warning: {
    icon: TriangleAlert,
    role: 'status',
    frame: 'alert-soft alert-warning',
    bar: 'progress-warning',
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
  const { icon: Icon, role, frame, bar, exclusive } = toastTypes[type];
  const host = useNotificationHost();
  const countdown = useNoticeCountdown(autoCloseMs, onClose);
  useExclusiveNotice(exclusive, onClose);
  if (!host) return null;
  return createPortal(
    <section
      role={role}
      className={`alert ${frame} alert-vertical sm:alert-horizontal shadow-lg pointer-events-auto text-left`}
      {...countdown.pauseProps}
    >
      <Icon size={24} className="shrink-0" aria-hidden="true" />
      <div className="min-w-0 w-full space-y-1">
        {children}
        {countdown.progress && (
          // Hidden from assistive technology on purpose: a <progress> carries a
          // polite announcement, so leaving it exposed makes a screen reader
          // report every step of a countdown the user did not ask to hear.
          <progress
            className={`progress ${bar} w-full`}
            value={countdown.progress.value}
            max={countdown.progress.max}
            aria-hidden="true"
          />
        )}
      </div>
      <button
        className="btn btn-outline btn-xs btn-square btn-neutral self-start"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </section>,
    host,
  );
}
