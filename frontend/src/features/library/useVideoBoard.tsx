import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppError, Video } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Drawer } from '../../shared/Drawer';
import { useBusy } from './useBusy';
import { useNotices } from './useNotices';
import { useScan } from './useScan';
import { useVideoActions } from './useVideoActions';
import { useVideos } from './useVideos';
import { useSpace } from '../space/SpaceProvider';
import { VideoMenu } from './VideoMenu';
import type { MenuTarget } from './VideoMenu';
import { VideoDetails } from './VideoDetails';
import { RemoveConfirmation } from './RemoveConfirmation';
import type { VideoActionHandlers } from './VideoActions';

function clientError(code: string): AppError {
  return { code, params: {}, errorId: crypto.randomUUID() };
}

/**
 * What every page of cards needs beyond the cards themselves: the menu a
 * right-click opens, the details drawer, the confirmation that stands between
 * the menu and a removal, and the actions all three reach for.
 *
 * It is a hook rather than a component because the pages differ in their layout
 * and agree on this: the library draws the grid into its own scroll area, and
 * the sharing page draws the 共享清单 into a page that already scrolls, but both
 * are the same cards with the same menu behind them. Handing each page the state
 * and the overlays keeps the wiring in one place while leaving the layout — the
 * part that is actually different — with the page.
 *
 * What is returned is a menu handler and an `overlays` element, not a rendered
 * page: only the caller knows where the cards go.
 */
export function useVideoBoard() {
  const { t } = useTranslation();
  const { videos: collection, lastPlayedId } = useVideos();
  const { status } = useScan();
  const { busy } = useBusy();
  const notices = useNotices();
  const videoActions = useVideoActions();
  const { id: spaceId } = useSpace();
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
  const actions: VideoActionHandlers = {
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
  const overlays = (
    <>
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
  return {
    actions,
    busy,
    scan: status,
    lastPlayedId,
    onMenu: setMenu,
    onScroll: closeMenu,
    overlays,
  };
}
