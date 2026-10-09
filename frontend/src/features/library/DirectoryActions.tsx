import { FolderPlus, Images, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/button';

type DirectoryActionsProps = {
  busy: boolean;
  onAdd: () => void;
  onRescan: () => void;
  onRegenerate?: () => void;
};

/**
 * The three folder-wide actions, at one size wherever they appear.
 *
 * They are larger than the rest of the interface's buttons and never shrink to
 * a card's: the words already say what each one does, so none of them carries a
 * tooltip, and the size is what keeps them from reading as one more control in
 * a row of them.
 */
export function DirectoryActions({
  busy,
  onAdd,
  onRescan,
  onRegenerate,
}: DirectoryActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
      <Button size="lg" className="gap-3" onClick={onAdd}>
        <FolderPlus size={18} aria-hidden="true" />
        {t('add')}
      </Button>
      <Button size="lg" className="gap-3" disabled={busy} onClick={onRescan}>
        <RefreshCw size={18} aria-hidden="true" />
        {t('rescan')}
      </Button>
      {onRegenerate && (
        <Button
          size="lg"
          className="gap-3"
          disabled={busy}
          onClick={onRegenerate}
        >
          <Images size={18} aria-hidden="true" />
          {t('regenerateAll')}
        </Button>
      )}
    </div>
  );
}
