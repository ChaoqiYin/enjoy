import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderMinus } from 'lucide-react';
import { LanguageSetting } from '../i18n/LanguageSetting';
import { ThemeSetting } from '../theme/ThemeSetting';
import { Tooltip } from '../shared/Tooltip';
import { ScrollViewport } from '../shared/ScrollViewport';
import { libraryApi } from '../shared/api';
import { useLibraryContext } from '../features/library/LibraryProvider';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { directoryScanAction } from '../features/library/scanDirectories';
import { PageFrame } from '../features/library/PageFrame';
import packageInfo from '../../../package.json';
export function SettingsPage() {
  const { t } = useTranslation();
  const library = useLibraryContext();
  const [showAdd, setShowAdd] = useState(false);
  const rescan = () =>
    library.run(directoryScanAction(library.directories.data ?? []));
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
            <span className="break-all flex-1">{path}</span>
            <Tooltip text={t('removeFolder')}>
              <button
                className="btn btn-outline btn-xs btn-square btn-error"
                aria-label={t('removeFolder')}
                disabled={library.busy}
                onClick={() =>
                  library.run(() => libraryApi.removeDirectory(path))
                }
              >
                <FolderMinus size={14} aria-hidden="true" />
              </button>
            </Tooltip>
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
    </PageFrame>
  );
}
