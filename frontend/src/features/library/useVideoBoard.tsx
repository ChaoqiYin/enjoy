import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import type { AppError, Video } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Drawer } from '../../shared/Drawer';
import { listingAt } from './listing';
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
 * What the details drawer is describing, and the answer it was read from: the
 * list and the page of it ({@link Videos.pageKey}) and how many records the list
 * held then. The video alone is not enough to say what has become of it later.
 */
type Opened = { video: Video; pageKey: string; total: number };

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
  const { pathname } = useLocation();
  const { videos: collection, lastPlayedId, pageKey } = useVideos();
  // Which listing is on screen. It is the route's answer, as it is everywhere
  // else a page asks which of the four it is (`useLibrary`, `useVideoPageView`),
  // and the removal rule below is the one place that needs it: only the whole
  // library can say a record has left it.
  const listing = listingAt(pathname);
  const { status } = useScan();
  const { busy } = useBusy();
  const notices = useNotices();
  const videoActions = useVideoActions();
  const { id: spaceId } = useSpace();
  // What the open drawer is describing, together with the answer it was read
  // from: the list, the page of it, and how long it was then. The panel needs
  // the video; the removal rule below needs the other two, and neither is
  // recoverable afterwards — the list may since have been asked something else
  // entirely, and a record that is not in the newest answer is not therefore
  // gone. Whatever was opened here was opened onto a video of the space that was
  // on screen: another space has its own records, so the panel and the menu are
  // closed rather than left describing a video that is no longer in the list.
  // The list itself needs nothing: it is mounted against the collection key,
  // which names the space, so the change reaches it on its own.
  const [detail, setDetail] = useState<Opened | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [remove, setRemove] = useState<Video | null>(null);
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
    if (!detailsOpen || !detail || collection.isPending) return;
    const answer = collection.data;
    if (!answer) return;
    // Two other answers can arrive while a drawer is open, and neither says
    // anything about the video in it. Turning a page, or asking the list
    // something else, is a question this record was never read from; the page
    // the drawer was opened on holds it, a hundred pages may not. So the answer
    // has to be the answer to that question before its silence means anything.
    if (pageKey !== detail.pageKey) return;
    // And only a list that has got shorter says a record was removed from it.
    // A record that has left this page for another one — played, while 最近播放
    // 页 is read in playing order, and pushed back here — is still in the
    // library, and so is one that slid back on.
    if (answer.total >= detail.total) return;
    // And only the whole library can say a record has left it. Three of the
    // four listings are the library under a condition the drawer can itself
    // answer — 收藏 and 共享 drop a record the moment the user un-favourites or
    // un-shares it — and that answer is not a removal: the file is still there,
    // the list simply no longer holds it. The condition is not part of the page
    // key the check above compares, so it has to be read from the page. On 视频库
    // there is no such condition: nothing the drawer can do shortens the list,
    // so a shorter one there means the record really left.
    if (listing !== '/') return;
    if (answer.items.some((video) => video.id === detail.video.id)) return;
    setDetailsOpen(false);
    notices.setError(clientError('media.file.removed'));
  }, [
    detailsOpen,
    detail,
    collection.isPending,
    collection.data,
    pageKey,
    listing,
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
      setDetail({
        video,
        pageKey,
        total: collection.data?.total ?? 0,
      });
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
        {detail && (
          <VideoDetails
            scan={status}
            video={detail.video}
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
