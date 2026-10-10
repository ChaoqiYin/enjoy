import { useTranslation } from 'react-i18next';
import { LibraryToolbar } from '../features/library/LibraryToolbar';
import { PageFrame } from '../features/library/PageFrame';
import { VideoPageContent } from '../features/library/VideoPageContent';
import { useVideoPageView } from '../features/library/useVideoPageView';
export function FavoritesPage() {
  const { t } = useTranslation();
  const view = useVideoPageView();

  return (
    <PageFrame>
      <LibraryToolbar {...view.toolbarProps} />
      <VideoPageContent
        view={view}
        listLabel={t('favorites')}
        emptyTitle={t('emptyFavorites')}
        emptyHelp={t('favoritesHelp')}
      />
    </PageFrame>
  );
}
