import { useEffect, useRef, useState, type ReactNode } from 'react';

type ConfirmTooltipProps = {
  children: ReactNode;
  message: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  cancelLabel: string;
  disabled?: boolean;
};

export function ConfirmTooltip({
  children,
  message,
  onConfirm,
  confirmLabel,
  cancelLabel,
  disabled = false,
}: ConfirmTooltipProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (disabled) return <>{children}</>;
  return (
    <span
      ref={root}
      className="relative inline-flex"
      onClick={() => setOpen(true)}
    >
      {children}
      {open && (
        <span
          className="absolute right-0 bottom-full z-20 mb-2 w-72 rounded-box bg-base-100 p-3 text-base-content shadow-lg border border-base-300"
          role="dialog"
          aria-label={message}
        >
          <span className="block break-all text-sm">{message}</span>
          <span className="flex justify-end items-center gap-3 pt-3">
            <button
              className="btn btn-soft btn-error btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                void onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </button>
            <button
              className="btn btn-soft btn-neutral btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
            >
              {cancelLabel}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
