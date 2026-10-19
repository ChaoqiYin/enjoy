import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../shared/errorMessage';
import { useCommand } from '../shared/useCommand';
import { Alert } from '../shared/ui/alert';
import { Button } from '../shared/ui/button';
import { Checkbox } from '../shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../shared/ui/dialog';
import { Label } from '../shared/ui/label';
import { usePluginHost } from './PluginHostProvider';
import type { PluginBootstrap, PluginStatus } from './status';

/**
 * Uninstalling a plugin, and the one question that goes with it.
 *
 * Removing a plugin's directory is not the whole of removing the plugin: it may
 * have written fields into the library, and those outlive it — the covers it
 * fetched are still on the records they were fetched for. So the user is asked
 * once whether the content goes too, and the answer starts at no: what a plugin
 * wrote is not the plugin's any more, and the user is the one who knows whether
 * it was worth keeping (spec #82 「卸载」).
 *
 * The count is the backend's and is asked for before the question is drawn,
 * because "delete its content" is a different decision at three rows than at
 * three thousand. A count that could not be read leaves the question standing
 * without a number: the honest answer is that this build cannot say, not zero.
 */
export function PluginUninstallDialog({
  status,
  onClose,
  onRemoved,
}: {
  status: PluginStatus;
  onClose: () => void;
  /** The list as the kernel answered with it, so the page redraws from it. */
  onRemoved: (plugins: readonly PluginBootstrap[]) => void;
}) {
  const translator = useTranslation();
  const { t } = translator;
  const { port } = usePluginHost();
  const { busy, failure, run } = useCommand();
  const [rows, setRows] = useState<number | null>(null);
  const [withContent, setWithContent] = useState(false);

  useEffect(() => {
    let live = true;
    void port
      .contentRows(status.id)
      .then((count) => {
        if (live) setRows(count);
      })
      .catch(() => {
        // Left as unknown rather than as zero: a count this build cannot read
        // is not a count of nothing.
        if (live) setRows(null);
      });
    return () => {
      live = false;
    };
  }, [port, status.id]);

  function remove() {
    return run(undefined, async () => {
      onRemoved(await port.uninstall(status.id, withContent));
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
          <DialogTitle>
            {t('pluginUninstallQuestion', { plugin: status.name })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-4">
          {rows !== null && rows > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('pluginUninstallRows', { countText: String(rows) })}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="plugin-uninstall-content"
              checked={withContent}
              onCheckedChange={(checked) => setWithContent(checked === true)}
            />
            <Label htmlFor="plugin-uninstall-content">
              {t('pluginUninstallContent')}
            </Label>
          </div>
        </div>
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
            variant="destructive"
            size="lg"
            disabled={busy}
            onClick={() => void remove()}
          >
            {t('pluginUninstall')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
