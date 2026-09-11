import { useTranslation } from 'react-i18next';
import { LibraryHeader } from '../features/library/LibraryHeader';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
export function FavoritesPage() {
  const { t } = useTranslation();
  const view = useVideoPageView('/favorites');

  return (
    <PageFrame>
      <LibraryHeader {...view.headerProps} title={t('favorites')} />
      <VideoPageContent
        view={view}
        emptyTitle={t('emptyFavorites')}
        emptyHelp={t('favoritesHelp')}
      />
    </PageFrame>
  );
}
