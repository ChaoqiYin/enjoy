import { CheckCircle, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNotificationHost } from './useNotificationHost';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

// Class names are written out in full and never interpolated: Tailwind only
// generates the utilities it can see as literal strings, so a built-up
// `alert-${type}` would render an uncoloured alert.
const toastTypes = {
  success: {
    icon: CheckCircle,
    role: 'status',
    frame: 'alert-soft alert-success',
  },
  error: { icon: CircleAlert, role: 'alert', frame: 'alert-soft alert-error' },
  info: { icon: Info, role: 'status', frame: 'alert-soft alert-info' },
  warning: {
    icon: TriangleAlert,
    role: 'status',
    frame: 'alert-soft alert-warning',
  },
} as const;

type ToastProps = {
  type: ToastType;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The frame every floating notice shares: portal, notification host, native
 * daisyUI alert colours, type icon and close button. The type decides the
 * colours, the icon and how assertively the notice is announced; the caller
 * supplies the body and its actions, so nothing here assumes what a notice
 * contains.
 */
export function Toast({ type, closeLabel, onClose, children }: ToastProps) {
  const host = useNotificationHost();
  if (!host) return null;
  const { icon: Icon, role, frame } = toastTypes[type];
  return createPortal(
    <section
      role={role}
      className={`alert ${frame} alert-vertical sm:alert-horizontal shadow-lg pointer-events-auto text-left`}
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
    </section>,
    host,
  );
}
