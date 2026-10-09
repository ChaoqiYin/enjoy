import { Button } from './ui/button';
import { Dialog, DialogPanel } from './ui/dialog';

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
 * the time the question is worth asking. So it is a modal panel — the answer is
 * the only thing reachable while it is up — and Escape counts as the answer that
 * does nothing, because that is what a modal's own dismissal already means. The
 * caller owns the question and the two answers; this owns nothing but their
 * shape.
 *
 * The modality is the library's: the portal, the hidden page behind, the focus
 * trap, the scroll lock and the Escape all come from the `Dialog`, and so does
 * the name the panel is read out by — it is the sentence the user is asked,
 * which is the whole of what this panel is. `DialogPanel` is taken rather than
 * `DialogContent` because the panel carries no dismiss control of its own: this
 * question has exactly two answers, and a third control would have to wear one
 * of their names.
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
  return (
    <Dialog
      open
      // Escape and a press on the overlay both arrive here as the answer that
      // does nothing, which is what dismissing a modal already means.
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogPanel aria-label={message} className="space-y-4">
        <p className="break-all">{message}</p>
        <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
