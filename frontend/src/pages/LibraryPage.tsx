import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LibraryHeader } from '../features/library/LibraryHeader';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
import { DirectoryActions } from '../features/library/DirectoryActions';
import { DirectoryDialog } from '../features/library/DirectoryDialog';
import { useLibraryContext } from '../features/library/LibraryProvider';
import { directoryScanAction } from '../features/library/scanDirectories';
export function LibraryPage() {
  const { t } = useTranslation();
  const view = useVideoPageView('/');
  const library = useLibraryContext();
  const [showAdd, setShowAdd] = useState(false);
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
            onRescan={() =>
              void library.run(
                directoryScanAction(library.directories.data ?? []),
              )
            }
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
    </PageFrame>
  );
}
