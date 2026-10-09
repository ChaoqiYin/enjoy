import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../shared/errorMessage';
import { useCommand } from '../../shared/useCommand';
import { Alert } from '../../shared/ui/alert';
import { Button } from '../../shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog';
import { Input } from '../../shared/ui/input';
import { Label } from '../../shared/ui/label';

/**
 * Names a space, for both creating one and renaming one, so that the two paths
 * cannot grow different rules or say different things about them.
 *
 * A refused name is reported beside the field rather than in the notice at the
 * corner of the screen: the answer belongs where the name was typed, and the
 * dialog stays open with the text still in it, so a fix costs a keystroke
 * instead of starting over. The rules themselves are the backend's — it is the
 * one that keeps the names, and the only one that can see all of them — so this
 * asks and waits rather than guessing first.
 */
export function SpaceDialog({
  title,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const translator = useTranslation();
  const { t } = translator;
  const [name, setName] = useState(initialName);
  const { busy, failure, run } = useCommand();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    // Closing is inside the action, and the failure is left here rather than
    // sent to the corner of the screen: it is about the name that was typed,
    // and the field it belongs beside is still open.
    return run(undefined, async () => {
      await onSubmit(name);
      onClose();
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* Escape closes the modal on its own, and this is what brings the caller
          back in step with it. */}
      <DialogContent closeLabel={t('close')} className="max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="space-name">{t('spaceName')}</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          {failure && (
            <Alert variant="destructive">
              {errorMessage(translator, failure.error)}
            </Alert>
          )}
          <DialogFooter className="items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
