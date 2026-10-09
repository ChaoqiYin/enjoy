import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Layers, Palette, RefreshCw } from 'lucide-react';
import packageInfo from '../../../package.json';
import { LanguageSetting } from '../i18n/LanguageSetting';
import { ThemeSetting } from '../theme/ThemeSetting';
import { ScrollViewport } from '../shared/ScrollViewport';
import { Badge } from '../shared/ui/badge';
import { SettingsSection } from '../features/settings/SettingsSection';
import { SettingsSidebar } from '../features/settings/SettingsSidebar';
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

/**
 * Where the application's preferences live, laid out the way the drawings put
 * them: a rail of sections down the left, and the one that is chosen on the
 * right.
 *
 * The two columns are squared off against the window rather than the page: the
 * frame around this is the height that is left once the header and footer have
 * taken theirs, and only the right column scrolls within it. The rail stays put
 * because moving it is what the reader came here to do, and the page behind
 * neither grows nor scrolls.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { busy } = useBusy();
  const directories = useDirectories();
  const space = useSpace();
  const [section, setSection] = useState('general');
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const folders = directories.directories.data ?? [];
  const rescan = () => {
    if (folders.length === 0) {
      setShowEmptyRescan(true);
      return;
    }
    void directories.rescan();
  };
  return (
    <PageFrame>
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <div className="flex shrink-0 flex-col gap-3 lg:w-64">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{t('settings')}</h1>
            <Badge variant="outline">{packageInfo.version}</Badge>
          </div>
          <SettingsSidebar
            value={section}
            onChange={setSection}
            items={[
              { value: 'general', label: t('settingsGeneral') },
              {
                value: 'folders',
                label: t('settingsFolders'),
                // What the entry has to report about itself: how many folders
                // this space is indexed from, and nothing when there are none.
                badge: folders.length > 0 ? String(folders.length) : undefined,
              },
            ]}
          />
        </div>
        <ScrollViewport className="min-h-0 flex-1 space-y-6">
          {section === 'general' ? (
            <>
              <SettingsSection icon={Palette} title={t('settingsAppearance')}>
                <div className="space-y-6">
                  <LanguageSetting />
                  <ThemeSetting />
                </div>
              </SettingsSection>
              <SettingsSection icon={Layers} title={t('spaces')}>
                <SpaceSetting />
              </SettingsSection>
              <SettingsSection icon={RefreshCw} title={t('updateTitle')}>
                <UpdateSetting />
              </SettingsSection>
            </>
          ) : (
            <>
              {/* Named after the space it belongs to, because it does not belong
                  to the application: each space has its own directories, and
                  this is the list of one of them. */}
              <SettingsSection
                icon={FolderOpen}
                title={t('foldersInSpace', { name: space.name })}
                description={t('settingsFoldersHelp')}
              >
                <div className="space-y-3">
                  {folders.map((path) => (
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
                    onRegenerate={() =>
                      void directories.regenerateAllThumbnails()
                    }
                  />
                </div>
              </SettingsSection>
            </>
          )}
        </ScrollViewport>
      </div>
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
