import { useEffect, useRef } from 'react';

/**
 * A question asked before something the user cannot take back from here.
 *
 * Two of them exist and they are the same question: ending the 共享服务 closes
 * connections a device may be in the middle of reading, and both leaving the
 * space it belongs to and closing the window would do that. Neither is
 * forbidden — the user may well mean it — so this asks rather than refuses.
 *
 * Where `ConfirmTooltip` hangs its question off the control that was pressed,
 * this one has no control to hang from: the window's close button is the
 * system's, and leaving a space is one item in a menu that is already closed by
 * the time the question is worth asking. So it is a `<dialog>` shown modally —
 * the answer is the only thing reachable while it is up — and Escape counts as
 * the answer that does nothing, because that is what a modal's own dismissal
 * already means. The caller owns the question and the two answers; this owns
 * nothing but their shape.
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={message}
      // Escape closes a modal on its own; this is what brings the caller back
      // in step with it, so the question does not stay open behind a closed
      // element.
      onClose={onCancel}
    >
      <div className="modal-box space-y-4">
        <p className="break-all">{message}</p>
        <div className="modal-action">
          <button
            className="btn btn-soft btn-sm btn-neutral"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className="btn btn-soft btn-sm btn-primary"
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
