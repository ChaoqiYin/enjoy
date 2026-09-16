import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LibraryHeader } from '../features/library/LibraryHeader';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { useLibraryContext } from '../features/library/LibraryProvider';
import { EmptyRescanConfirmation } from '../features/library/EmptyRescanConfirmation';
import { libraryApi } from '../shared/api';
export function LibraryPage() {
  const { t } = useTranslation();
  const view = useVideoPageView('/');
  const library = useLibraryContext();
  const [showAdd, setShowAdd] = useState(false);
  const [showEmptyRescan, setShowEmptyRescan] = useState(false);
  const onAdd = () => setShowAdd(true);
  return (
    <PageFrame>
      <LibraryHeader
        {...view.headerProps}
        title={t('library')}
        actions={
          <DirectoryActions
            busy={library.busy}
            onAdd={onAdd}
            onRescan={() => {
              if ((library.directories.data ?? []).length === 0) {
                setShowEmptyRescan(true);
                return;
              }
              void library.run(libraryApi.rescan);
            }}
          />
        }
      />
      <VideoPageContent
        view={view}
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
            void library.run(libraryApi.rescan);
          }}
        />
      )}
    </PageFrame>
  );
}
