import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../shared/ui/dialog';

/**
 * The question asked before a rescan is started with nothing to scan. Its words
 * arrive from the caller, so the same shape serves any "there is nothing here,
 * carry on?" the settings page has to ask.
 */
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
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {/* The cross does the same thing as the button that says no, but they
          must not answer to the same name: two controls with one name are two
          controls neither a test nor a screen reader can tell apart. */}
      <DialogContent closeLabel={t('close')} className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
        <DialogFooter className="items-center gap-3">
          <Button variant="secondary" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="lg" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
