import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderMinus } from 'lucide-react';
import { LanguageSetting } from '../i18n/LanguageSetting';
import { ThemeSetting } from '../theme/ThemeSetting';
import { ConfirmTooltip } from '../shared/ConfirmTooltip';
import { ScrollViewport } from '../shared/ScrollViewport';
import { libraryApi } from '../shared/api';
import { displayPath } from '../shared/format';
import { useLibraryContext } from '../features/library/LibraryProvider';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { EmptyRescanConfirmation } from '../features/library/EmptyRescanConfirmation';
import { PageFrame } from '../features/library/PageFrame';
import packageInfo from '../../../package.json';
export function SettingsPage() {
  const { t } = useTranslation();
  const library = useLibraryContext();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const rescan = () => {
    if ((library.directories.data ?? []).length === 0) {
      setShowEmptyRescan(true);
      return;
    }
    void library.run(libraryApi.rescan);
  };
  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        <h1 className="text-3xl font-bold">{t('settings')}</h1>
        <LanguageSetting />
        <ThemeSetting />
        <h2 className="text-xl">{t('folders')}</h2>
        {(library.directories.data ?? []).map((path) => (
          <div
            key={path}
            className="flex items-center gap-4 bg-base-200 p-4 rounded-box"
          >
            <span className="break-all flex-1">{displayPath(path)}</span>
            <ConfirmTooltip
              message={t('removeQuestion', { name: displayPath(path) })}
              confirmLabel={t('confirm')}
              cancelLabel={t('cancel')}
              disabled={library.busy}
              onConfirm={() =>
                library.run(() => libraryApi.removeDirectory(path))
              }
            >
              <button
                className="btn btn-outline btn-xs btn-square btn-error"
                aria-label={t('removeFolder')}
                disabled={library.busy}
              >
                <FolderMinus size={14} aria-hidden="true" />
              </button>
            </ConfirmTooltip>
          </div>
        ))}
        <DirectoryActions
          busy={library.busy}
          onAdd={() => setShowAdd(true)}
          onRescan={rescan}
          onRegenerate={() =>
            void library.run(() => libraryApi.regenerate(null))
          }
        />
        <h2 className="text-xl">{t('about')}</h2>
        <p className="text-sm opacity-65">v{packageInfo.version}</p>
      </ScrollViewport>
      {showAdd && <DirectoryDialog onClose={() => setShowAdd(false)} />}
      {showEmptyRescan && (
        <EmptyRescanConfirmation
          title={t('rescan')}
          message={t('noFoldersRescan')}
          confirmLabel={t('continue')}
          cancelLabel={t('cancel')}
          onCancel={() => setShowEmptyRescan(false)}
          onConfirm={() => {
            setShowEmptyRescan(false);
            void library.run(libraryApi.rescan);
          }}
        />
      )}
    </PageFrame>
  );
}
