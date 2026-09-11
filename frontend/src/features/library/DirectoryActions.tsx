import { FolderPlus, Images, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type DirectoryActionsProps = {
  busy: boolean;
  onAdd: () => void;
  onRescan: () => void;
  onRegenerate?: () => void;
};

export function DirectoryActions({
  busy,
  onAdd,
  onRescan,
  onRegenerate,
}: DirectoryActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
      <button className="btn btn-md btn-primary btn-soft" onClick={onAdd}>
        <FolderPlus size={18} aria-hidden="true" />
        {t('add')}
      </button>
      <button
        className="btn btn-md btn-primary btn-soft"
        disabled={busy}
        onClick={onRescan}
      >
        <RefreshCw size={18} aria-hidden="true" />
        {t('rescan')}
      </button>
      {onRegenerate && (
        <button
          className="btn btn-md btn-primary btn-soft"
          disabled={busy}
          onClick={onRegenerate}
        >
          <Images size={18} aria-hidden="true" />
          {t('regenerateAll')}
        </button>
      )}
    </div>
  );
}
