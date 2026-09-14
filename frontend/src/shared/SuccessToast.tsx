import { CheckCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNotificationHost } from './useNotificationHost';

type SuccessToastProps = {
  title: string;
  description: string;
  closeLabel: string;
  onClose: () => void;
};

export function SuccessToast({
  title,
  description,
  closeLabel,
  onClose,
}: SuccessToastProps) {
  const host = useNotificationHost();
  if (!host) return null;
  return createPortal(
    <section
      role="status"
      className="alert alert-vertical sm:alert-horizontal border-success/30 bg-base-100 shadow-lg pointer-events-auto text-left"
    >
      <CheckCircle
        size={24}
        className="text-success shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 w-full space-y-1">
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm break-words">{description}</p>
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
