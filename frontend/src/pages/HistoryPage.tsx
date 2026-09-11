import { useTranslation } from 'react-i18next';
import { LibraryHeader } from '../features/library/LibraryHeader';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
export function HistoryPage() {
  const { t } = useTranslation();
  const view = useVideoPageView('/history');

  return (
    <PageFrame>
      <LibraryHeader {...view.headerProps} title={t('history')} />
      <VideoPageContent
        view={view}
        emptyTitle={t('emptyHistory')}
        emptyHelp={t('historyHelp')}
      />
    </PageFrame>
  );
}
