import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSetting } from '../i18n/LanguageSetting';
import { ThemeSetting } from '../theme/ThemeSetting';
import { ScrollViewport } from '../shared/ScrollViewport';
import { useBusy } from '../features/library/useBusy';
import { useDirectories } from '../features/library/useDirectories';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { DirectoryRow } from '../features/library/DirectoryRow';
import { EmptyRescanConfirmation } from '../features/library/EmptyRescanConfirmation';
import { PageFrame } from '../features/library/PageFrame';
import { SpaceSetting } from '../features/space/SpaceSetting';
import { useSpace } from '../features/space/SpaceProvider';
import { UpdateSetting } from '../features/update/UpdateSetting';
export function SettingsPage() {
  const { t } = useTranslation();
  const { busy } = useBusy();
  const directories = useDirectories();
  const space = useSpace();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const rescan = () => {
    if ((directories.directories.data ?? []).length === 0) {
      setShowEmptyRescan(true);
      return;
    }
    void directories.rescan();
  };
  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        <h1 className="text-3xl font-bold">{t('settings')}</h1>
        <LanguageSetting />
        <ThemeSetting />
        <h2 className="text-xl">{t('spaces')}</h2>
        <SpaceSetting />
        {/* Named after the space it belongs to, because it does not belong to
            the application: each space has its own directories, and this is the
            list of one of them. */}
        <h2 className="text-xl">{t('foldersInSpace', { name: space.name })}</h2>
        {(directories.directories.data ?? []).map((path) => (
          <DirectoryRow
            key={path}
            path={path}
            disabled={busy}
            onRemove={() => directories.removeDirectory(path)}
          />
        ))}
        <DirectoryActions
          busy={busy}
          onAdd={() => setShowAdd(true)}
          onRescan={rescan}
          onRegenerate={() => void directories.regenerateAllThumbnails()}
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
            void directories.rescan();
          }}
        />
      )}
    </PageFrame>
  );
}
