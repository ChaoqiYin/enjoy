import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus } from 'lucide-react';
import { libraryApi } from '../../shared/api';
import type { AppError, Video } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Drawer } from '../../shared/Drawer';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { useLibraryContext } from './LibraryProvider';
import type { useVideoPageView } from './useVideoPageView';
import { VirtualVideos } from './VirtualVideos';
import { VideoMenu } from './VideoMenu';
import type { MenuTarget } from './VideoMenu';
import { VideoDetails } from './VideoDetails';
import { RemoveConfirmation } from './RemoveConfirmation';

function clientError(code: string): AppError {
  return { code, params: {}, errorId: crypto.randomUUID() };
}

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
  // `detailVideo` is the panel's contents, not a mount gate: the drawer shell
  // is always mounted and only `detailsOpen` moves it, so the video stays put
  // through the closing slide and is replaced the next time one is opened.
  const [detailVideo, setDetailVideo] = useState<Video | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [remove, setRemove] = useState<Video | null>(null);
  useEffect(() => {
    // Only a drawer that is open can report its video missing. Closing it here
    // is what stops the effect from firing again — the panel keeps its video
    // now, so without this every later rescan would repeat the same notice. It
    // also keeps a deliberate removal, which closes the drawer before removing,
    // from announcing itself a second time.
    if (!detailsOpen || !detailVideo || library.videos.isPending) return;
    if (!library.videos.data) return;
    if (library.videos.data.some((video) => video.id === detailVideo.id))
      return;
    setDetailsOpen(false);
    library.setError(clientError('media.file.removed'));
  }, [
    detailsOpen,
    detailVideo,
    library.videos.isPending,
    library.videos.data,
    library.setError,
  ]);
  // The marker is written after the call resolves, not beside the click: a
  // launch that never reached the system player raises instead, `run` turns
  // that into a notice, and the card keeps whatever marker it had — the same
  // rule the record follows, where a failed launch does not count as a play.
  const play = (video: Video) =>
    library.run(async () => {
      await libraryApi.play(video.path);
      library.markPlayed(video.id);
    });
  const favorite = (video: Video) =>
    library.run(() => libraryApi.favorite(video.path, !video.favorite));
  const copyPath = async (video: Video) => {
    if (!navigator.clipboard) {
      library.setError(clientError('app.clipboard.failed'));
      return;
    }
    try {
      // The clipboard gets the path the panel shows, not the verbatim one the
      // index stores: they are two spellings of the same file, and the user
      // asked for the one in front of them.
      await navigator.clipboard.writeText(displayPath(video.path));
      library.showCopyHint();
    } catch {
      library.setError(clientError('app.clipboard.failed'));
    }
  };
  const actions = {
    play,
    favorite,
    reveal: (video: Video) => library.run(() => libraryApi.reveal(video.path)),
    remove: (video: Video) => {
      setDetailsOpen(false);
      setRemove(video);
    },
    details: (video: Video) => {
      setDetailVideo(video);
      setDetailsOpen(true);
    },
    copyPath,
    regenerate: (video: Video) =>
      library.run(() => libraryApi.regenerate(video.path)),
    refreshInfo: (video: Video) =>
      library.run(() => libraryApi.refreshInfo(video.path)),
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
            onMenu={setMenu}
            busy={library.busy}
            actions={actions}
            lastPlayedId={library.lastPlayedId}
            onScroll={closeMenu}
          />
        )}
      </div>
      <Drawer
        open={detailsOpen}
        title={t('details')}
        closeLabel={t('closeDetails')}
        onClose={() => setDetailsOpen(false)}
      >
        {detailVideo && (
          <VideoDetails
            scan={library.scan.data}
            video={detailVideo}
            busy={library.busy}
            actions={actions}
          />
        )}
      </Drawer>
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
