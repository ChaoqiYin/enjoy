import { useEffect, useRef } from 'react';

export function EmptyRescanConfirmation({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog ref={dialog} className="modal" onClose={onCancel}>
      <div className="modal-box space-y-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p>{message}</p>
        <div className="modal-action items-center gap-3">
          <form method="dialog">
            <button className="btn btn-soft btn-md btn-neutral">
              {cancelLabel}
            </button>
          </form>
          <button
            className="btn btn-soft btn-md btn-primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
