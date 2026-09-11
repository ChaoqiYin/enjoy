import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus } from 'lucide-react';
import { libraryApi } from '../../shared/api';
import type { Video } from '../../shared/api';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { useLibraryContext } from './LibraryProvider';
import type { useVideoPageView } from './useVideoPageView';
import { VirtualVideos } from './VirtualVideos';
import { VideoMenu } from './VideoMenu';
import type { MenuTarget } from './VideoMenu';
import { VideoDetails } from './VideoDetails';
import { RemoveConfirmation } from './RemoveConfirmation';
export function VideoPageContent({
  view,
  emptyTitle,
  emptyHelp,
  onAdd,
}: {
  view: ReturnType<typeof useVideoPageView>;
  emptyTitle: string;
  emptyHelp: string;
  onAdd?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const library = useLibraryContext();
  const { collectionKey, videos, search, folder, clearFilters } = view;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const detailVideo = library.videos.data?.find(
    (video) => video.id === detailsId,
  );
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [remove, setRemove] = useState<Video | null>(null);
  const play = (video: Video) => library.run(() => libraryApi.play(video.path));
  const favorite = (video: Video) =>
    library.run(() => libraryApi.favorite(video.path, !video.favorite));
  const actions = {
    play,
    favorite,
    reveal: (video: Video) => library.run(() => libraryApi.reveal(video.path)),
    remove: (video: Video) => {
      setDetailsId(null);
      setRemove(video);
    },
    details: (video: Video) => setDetailsId(video.id),
    regenerate: (video: Video) =>
      library.run(() => libraryApi.regenerate(video.path)),
  };
  return (
    <>
      <p className="shrink-0 opacity-60">
        {t('videoCount', {
          count: videos.length,
          countText: videos.length.toLocaleString(i18n.language),
        })}
      </p>
      <div className="min-h-0 flex-1 flex flex-col">
        {library.videos.isPending ? (
          <p>{t('loading')}</p>
        ) : videos.length === 0 ? (
          <ScrollViewport className="text-center py-24 space-y-4">
            <h2 className="text-2xl">
              {search || folder ? t('noMatch') : emptyTitle}
            </h2>
            <p>{search || folder ? t('noMatchHelp') : emptyHelp}</p>
            {(search || folder) && (
              <button
                className="btn btn-outline btn-sm btn-info"
                onClick={clearFilters}
              >
                {t('clear')}
              </button>
            )}
            {onAdd && (
              <button
                className="btn btn-outline btn-sm btn-primary"
                onClick={onAdd}
              >
                <FolderPlus size={14} aria-hidden="true" />
                {t('add')}
              </button>
            )}
          </ScrollViewport>
        ) : (
          <VirtualVideos
            key={collectionKey}
            scan={library.scan.data}
            videos={videos}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMenu={setMenu}
            busy={library.busy}
            actions={actions}
            onScroll={closeMenu}
          />
        )}
      </div>
      {detailVideo && (
        <VideoDetails
          scan={library.scan.data}
          video={detailVideo}
          busy={library.busy}
          actions={actions}
          onClose={() => setDetailsId(null)}
        />
      )}
      {remove && (
        <RemoveConfirmation
          video={remove}
          onCancel={() => setRemove(null)}
          onConfirm={() => {
            void library.run(() => libraryApi.remove(remove.path));
            setRemove(null);
          }}
        />
      )}
      {menu && (
        <VideoMenu
          target={menu}
          busy={library.busy}
          actions={actions}
          onClose={closeMenu}
        />
      )}
    </>
  );
}
