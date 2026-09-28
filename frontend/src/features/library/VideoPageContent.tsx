import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus } from 'lucide-react';
import type { AppError, Video } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Drawer } from '../../shared/Drawer';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { useBusy } from './useBusy';
import { useNotices } from './useNotices';
import { useScan } from './useScan';
import { useVideoActions } from './useVideoActions';
import { useVideos } from './useVideos';
import { useSpace } from '../space/SpaceProvider';
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
  const { videos: collection, lastPlayedId } = useVideos();
  const { status } = useScan();
  const { busy } = useBusy();
  const notices = useNotices();
  const videoActions = useVideoActions();
  const { id: spaceId } = useSpace();
  const { collectionKey, videos, filtered, clearFilters } = view;
  // `detailVideo` is the panel's contents, not a mount gate: the drawer shell
  // is always mounted and only `detailsOpen` moves it, so the video stays put
  // through the closing slide and is replaced the next time one is opened.
  const [detailVideo, setDetailVideo] = useState<Video | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [remove, setRemove] = useState<Video | null>(null);
  // Whatever was opened here was opened onto a video of the space that was on
  // screen. Another space has its own records, so the panel and the menu are
  // closed rather than left describing a video that is no longer in the list.
  // The list itself needs nothing: it is mounted against the collection key,
  // which names the space, so the change reaches it on its own.
  useEffect(() => {
    setDetailsOpen(false);
    setMenu(null);
  }, [spaceId]);
  useEffect(() => {
    // Only a drawer that is open can report its video missing. Closing it here
    // is what stops the effect from firing again — the panel keeps its video
    // now, so without this every later rescan would repeat the same notice. It
    // also keeps a deliberate removal, which closes the drawer before removing,
    // from announcing itself a second time.
    if (!detailsOpen || !detailVideo || collection.isPending) return;
    if (!collection.data) return;
    if (collection.data.some((video) => video.id === detailVideo.id)) return;
    setDetailsOpen(false);
    notices.setError(clientError('media.file.removed'));
  }, [
    detailsOpen,
    detailVideo,
    collection.isPending,
    collection.data,
    notices.setError,
  ]);
  const copyPath = async (video: Video) => {
    if (!navigator.clipboard) {
      notices.setError(clientError('app.clipboard.failed'));
      return;
    }
    try {
      // The clipboard gets the path the panel shows, not the verbatim one the
      // index stores: they are two spellings of the same file, and the user
      // asked for the one in front of them.
      await navigator.clipboard.writeText(displayPath(video.path));
      notices.showCopyHint();
    } catch {
      notices.setError(clientError('app.clipboard.failed'));
    }
  };
  const actions = {
    play: videoActions.play,
    favorite: videoActions.toggleFavorite,
    share: videoActions.toggleShared,
    reveal: videoActions.reveal,
    remove: (video: Video) => {
      setDetailsOpen(false);
      setRemove(video);
    },
    details: (video: Video) => {
      setDetailVideo(video);
      setDetailsOpen(true);
    },
    copyPath,
    regenerate: videoActions.regenerateThumbnail,
    refreshInfo: videoActions.refreshInfo,
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
        {collection.isPending ? (
          <p>{t('loading')}</p>
        ) : videos.length === 0 ? (
          <ScrollViewport className="text-center py-24 space-y-4">
            <h2 className="text-2xl">{filtered ? t('noMatch') : emptyTitle}</h2>
            <p>{filtered ? t('noMatchHelp') : emptyHelp}</p>
            {filtered && (
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
            scan={status}
            videos={videos}
            onMenu={setMenu}
            busy={busy}
            actions={actions}
            lastPlayedId={lastPlayedId}
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
            scan={status}
            video={detailVideo}
            busy={busy}
            actions={actions}
          />
        )}
      </Drawer>
      {remove && (
        <RemoveConfirmation
          video={remove}
          onCancel={() => setRemove(null)}
          onConfirm={() => {
            void videoActions.removeVideo(remove);
            setRemove(null);
          }}
        />
      )}
      {menu && (
        <VideoMenu
          target={menu}
          busy={busy}
          actions={actions}
          onClose={closeMenu}
        />
      )}
    </>
  );
}
