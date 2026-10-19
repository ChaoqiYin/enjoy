import { useTranslation } from 'react-i18next';
import { errorMessage } from '../shared/errorMessage';
import { useCommand } from '../shared/useCommand';
import { Alert } from '../shared/ui/alert';
import { Button } from '../shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../shared/ui/dialog';
import { usePluginHost } from './PluginHostProvider';
import type { PluginBootstrap } from './status';

/**
 * Safe mode: the way to a window that loads no plugin at all.
 *
 * It is a question rather than a button because it is not an action on any one
 * plugin — it switches every one of them off at once. What it does *not* do is
 * uninstall anything: the plugins stay on disk, exactly where they were, and
 * switching them back on is the same list the page draws. That is the whole
 * point of the recovery being a rename of the enable record rather than a
 * rewrite of anything (ADR 0044 §7): a plugin that stops the application from
 * starting must not be able to stop this from working.
 *
 * Like every other lifecycle action, it takes effect on the next start — the
 * plugins this window is already running are not unloaded by it.
 */
export function PluginSafeModeDialog({
  onClose,
  onEntered,
}: {
  onClose: () => void;
  /** The list as the kernel answered with it, so the page redraws from it. */
  onEntered: (plugins: readonly PluginBootstrap[]) => void;
}) {
  const translator = useTranslation();
  const { t } = translator;
  const { port } = usePluginHost();
  const { busy, failure, run } = useCommand();

  function enter() {
    return run(undefined, async () => {
      onEntered(await port.safeMode());
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
      <DialogContent closeLabel={t('close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pluginSafeMode')}</DialogTitle>
          <DialogDescription>{t('pluginSafeModeQuestion')}</DialogDescription>
        </DialogHeader>
        {failure && (
          <Alert variant="destructive" className="mt-4">
            {errorMessage(translator, failure.error)}
          </Alert>
        )}
        <DialogFooter className="items-center gap-3">
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={() => void enter()}
          >
            {t('pluginSafeModeEnter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
