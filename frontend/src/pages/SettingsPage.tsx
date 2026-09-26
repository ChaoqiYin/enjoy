import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FolderMinus } from 'lucide-react';
import { LanguageSetting } from '../i18n/LanguageSetting';
import { ThemeSetting } from '../theme/ThemeSetting';
import { ConfirmTooltip } from '../shared/ConfirmTooltip';
import { ScrollViewport } from '../shared/ScrollViewport';
import { displayPath } from '../shared/format';
import { useLibraryContext } from '../features/library/LibraryProvider';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { EmptyRescanConfirmation } from '../features/library/EmptyRescanConfirmation';
import { PageFrame } from '../features/library/PageFrame';
import { SpaceSetting } from '../features/space/SpaceSetting';
import { useSpace } from '../features/space/SpaceProvider';
import { UpdateSetting } from '../features/update/UpdateSetting';
export function SettingsPage() {
  const { t } = useTranslation();
  const library = useLibraryContext();
  const space = useSpace();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const { hash } = useLocation();
  useEffect(() => {
    // A page whose only entry point is a hash arrives at the top of it and
    // leaves the reader to find the section themselves. There is one such
    // entry: the space switcher, arriving at the list of spaces.
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  const rescan = () => {
    if ((library.directories.data ?? []).length === 0) {
      setShowEmptyRescan(true);
      return;
    }
    void library.rescan();
  };
  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        <h1 className="text-3xl font-bold">{t('settings')}</h1>
        <LanguageSetting />
        <ThemeSetting />
        {/* Named so the switcher's own entry can land on it: this section is
            what that entry is about, and the page around it is not. */}
        <section id="spaces" className="space-y-4">
          <h2 className="text-xl">{t('spaces')}</h2>
          <SpaceSetting />
        </section>
        {/* Named after the space it belongs to, because it does not belong to
            the application: each space has its own directories, and this is the
            list of one of them. */}
        <h2 className="text-xl">{t('foldersInSpace', { name: space.name })}</h2>
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
              onConfirm={() => library.removeDirectory(path)}
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
          onRegenerate={() => void library.regenerateAllThumbnails()}
        />
        <h2 className="text-xl">{t('about')}</h2>
        <UpdateSetting />
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
            void library.rescan();
          }}
        />
      )}
    </PageFrame>
  );
}
