import { CircleAlert, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNotificationHost } from './useNotificationHost';

type ErrorToastProps = {
  title: string;
  description: string;
  reference?: string;
  retryLabel: string;
  closeLabel: string;
  onRetry?: () => void;
  onClose: () => void;
};

export function ErrorToast({
  title,
  description,
  reference,
  retryLabel,
  closeLabel,
  onRetry,
  onClose,
}: ErrorToastProps) {
  const host = useNotificationHost();
  if (!host) return null;
  return createPortal(
    <section
      role="alert"
      className="alert alert-vertical sm:alert-horizontal border-error/30 bg-base-100 shadow-lg pointer-events-auto text-left"
    >
      <CircleAlert
        size={24}
        className="text-error shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 w-full space-y-1">
        <h3 className="font-bold">{title}</h3>
        <p className="text-sm break-words">{description}</p>
        {reference && (
          <p className="text-xs text-base-content/60 break-all">{reference}</p>
        )}
        {onRetry && (
          <button
            className="btn btn-outline btn-sm btn-primary mt-2"
            onClick={onRetry}
          >
            {retryLabel}
          </button>
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
