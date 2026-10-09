import { useTranslation } from 'react-i18next';
import { LibraryToolbar } from '../features/library/LibraryToolbar';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
export function HistoryPage() {
  const { t } = useTranslation();
  const view = useVideoPageView();

  return (
    <PageFrame>
      <LibraryToolbar {...view.toolbarProps} title={t('history')} />
      <VideoPageContent
        view={view}
        emptyTitle={t('emptyHistory')}
        emptyHelp={t('historyHelp')}
      />
    </PageFrame>
  );
}
