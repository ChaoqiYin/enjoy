import { FileArchive, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pickPluginSource } from '../shared/api';
import { errorMessage } from '../shared/errorMessage';
import { useCommand } from '../shared/useCommand';
import { Alert } from '../shared/ui/alert';
import { Badge } from '../shared/ui/badge';
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
import type { PluginBootstrap, PluginInstallPreview } from './status';

/**
 * Installing a plugin: pick a source, read it, and say what it would do before
 * any of it is copied.
 *
 * The two steps are one dialog because they are one decision. The platform's
 * picker is a folder picker or a file picker and never both, so the shape of
 * what the user has is asked rather than guessed — and whatever comes back is
 * read and shown: where it would land, who wrote it, what it asks for, and
 * which halves it brings. Nothing is copied until the user has seen that and
 * pressed the second button, which is the whole of what a pre-flight is for
 * (spec #82 「安装」).
 *
 * There is no address to type and no catalogue to browse: v1 installs from the
 * machine, and a plugin the user has not already downloaded is not something
 * this dialog can offer them.
 */
export function PluginInstallDialog({
  onClose,
  onInstalled,
}: {
  onClose: () => void;
  /** The list as the kernel answered with it, so the page redraws from it. */
  onInstalled: (plugins: readonly PluginBootstrap[]) => void;
}) {
  const translator = useTranslation();
  const { t } = translator;
  const { port } = usePluginHost();
  const { busy, failure, run } = useCommand();
  const [source, setSource] = useState<string | null>(null);
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);

  /** Which of the two shapes the user is reaching for. */
  function choose(shape: 'folder' | 'archive') {
    return run(undefined, async () => {
      const chosen = await pickPluginSource(shape === 'archive');
      // A cancelled picker is not a choice: what was read before stays on
      // screen, so that opening the wrong one of the two buttons costs nothing.
      if (chosen === null) return;
      setSource(chosen);
      setPreview(await port.preview(chosen));
    });
  }

  function install() {
    if (source === null) return;
    // Closing is inside the action and the failure is left here rather than
    // sent to the corner of the screen: it is about the source the user picked,
    // and the dialog that asked for it is still open to say so.
    return run(undefined, async () => {
      onInstalled(await port.install(source));
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
          <DialogTitle>{t('pluginInstall')}</DialogTitle>
          <DialogDescription>{t('pluginInstallPick')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void choose('folder')}
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t('pluginInstallFolder')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void choose('archive')}
          >
            <FileArchive size={14} aria-hidden="true" />
            {t('pluginInstallArchive')}
          </Button>
        </div>
        {preview !== null && <Preview preview={preview} />}
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
            disabled={busy || preview === null}
            onClick={() => void install()}
          >
            {t('pluginInstallConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The words for the four capabilities the kernel grants, and for one it does
 * not know.
 *
 * A table rather than a key built from the name, so that every translation key
 * this dialog asks for is a literal a reader — and `check-translations.mjs` —
 * can see. The kernel refuses a manifest naming anything outside the four, so
 * the fallback is unreachable through the interface; it is here so that a
 * capability added on the kernel's side shows up as a name rather than as a
 * missing-key string.
 */
const CAPABILITY_WORDS: Readonly<Record<string, string>> = {
  fetch: 'pluginCapabilityFetch',
  storage: 'pluginCapabilityStorage',
  log: 'pluginCapabilityLog',
  video: 'pluginCapabilityVideo',
};

/**
 * What the source turned out to be.
 *
 * The destination is written out in full rather than described, because the
 * user has no other way to learn where plugins live and no way to tell two
 * installs apart afterwards. The capabilities are named one by one and never
 * summed into a count: "it asks for three things" is a sentence that hides the
 * one thing the user would have refused.
 */
function Preview({ preview }: { preview: PluginInstallPreview }) {
  const { t } = useTranslation();
  const { plugin } = preview;
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <p className="font-medium">{plugin.name}</p>
      {plugin.author !== '' && (
        <p className="text-muted-foreground">
          {t('pluginAuthor', { author: plugin.author })}
        </p>
      )}
      <p className="text-muted-foreground break-all">
        {t('pluginInstallInto', { path: preview.destination })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          {t('pluginInstallCapabilities')}
        </span>
        {plugin.capabilities.length === 0 ? (
          <span className="text-muted-foreground">
            {t('pluginInstallNoCapabilities')}
          </span>
        ) : (
          plugin.capabilities.map((capability) => (
            <Badge key={capability} size="sm">
              {t(CAPABILITY_WORDS[capability] ?? 'pluginCapabilityOther')}
            </Badge>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          {t('pluginInstallHalves')}
        </span>
        {plugin.entry !== null && (
          <Badge size="sm">{t('pluginHalfInterface')}</Badge>
        )}
        {plugin.hasBody && <Badge size="sm">{t('pluginHalfBody')}</Badge>}
      </div>
    </div>
  );
}
