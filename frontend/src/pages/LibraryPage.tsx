import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LibraryToolbar } from '../features/library/LibraryToolbar';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { useBusy } from '../features/library/useBusy';
import { useDirectories } from '../features/library/useDirectories';
import { EmptyRescanConfirmation } from '../features/library/EmptyRescanConfirmation';
export function LibraryPage() {
  const { t } = useTranslation();
  const view = useVideoPageView();
  const { busy } = useBusy();
  const directories = useDirectories();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const onAdd = () => setShowAdd(true);
  return (
    <PageFrame>
      <LibraryToolbar
        {...view.toolbarProps}
        title={t('library')}
        actions={
          <DirectoryActions
            busy={busy}
            onAdd={onAdd}
            onRescan={() => {
              if ((directories.directories.data ?? []).length === 0) {
                setShowEmptyRescan(true);
                return;
              }
              void directories.rescan();
            }}
          />
        }
      />
      <VideoPageContent
        view={view}
        listLabel={t('library')}
        emptyTitle={t('empty')}
        emptyHelp={t('welcome')}
        onAdd={onAdd}
      />
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
