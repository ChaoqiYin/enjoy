import { useTranslation } from 'react-i18next';
import { FolderPlus, SearchX, VideoOff } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';
import { VideoBoard } from './VideoBoard';
import { hoverRoomStyle } from './videoCardBox';
import { useVideos } from './useVideos';
import type { useVideoPageView } from './useVideoPageView';
import { useVideoBoard } from './useVideoBoard';

/**
 * One listing, as a page of cards: how much the list holds, the records of the
 * page being read, and the way to the rest of it.
 *
 * It is the assembly three of the four listing pages share — 视频库, 收藏 and
 * 最近播放 differ in their title, their own actions and what they say when they
 * are empty, and in nothing else — and it is written once here so that a rule
 * about the list is a rule for all three: the count is about the library and is
 * drawn above the scroll area rather than in it, the shape is the one the page
 * remembers ([`useVideoPageView`]), and the list is mounted against
 * `collectionKey` so that turning a page or describing another list starts the
 * list it renders at its top.
 *
 * What clips the cards is here too, and it is the only thing that does: the
 * room the first row's and first column's hover feedback needs is the clipper's
 * to give (`hoverRoomStyle`), and the scroll that gives it up is also the
 * pointer moving over the list, which is where a menu left open has to close.
 * The 共享页 assembles its own listing — it draws other blocks beside it and
 * scrolls them together — and carries the same two things on its own viewport.
 */
export function VideoPageContent({
  view,
  listLabel,
  emptyTitle,
  emptyHelp,
  onAdd,
}: {
  view: ReturnType<typeof useVideoPageView>;
  /** What the scroll area is called, in the page's own words: 视频库, 收藏,
   *  最近播放. Each page names its own list; this file cannot. */
  listLabel: string;
  emptyTitle: string;
  emptyHelp: string;
  onAdd?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { videos: collection } = useVideos();
  const { actions, busy, scan, lastPlayedId, onMenu, onScroll, overlays } =
    useVideoBoard();
  const {
    collectionKey,
    videos,
    total,
    index,
    turnTo,
    filtered,
    clearFilters,
  } = view;
  // The shape the page is being read in, from the same place the switch that
  // changes it reports to (`useVideoPageView.toolbarProps`): one value, two
  // readers, neither of which remembers it itself.
  const viewMode = view.toolbarProps.viewMode;
  const count = (value: number) => value.toLocaleString(i18n.language);
  // 首启 — the library page with nothing in it and folders to add — is the one
  // empty state that is the whole screen rather than a state of the list, so it
  // is drawn large and says which files it can read at all. Every other page
  // that comes up empty says so at the listing's own scale, and 收藏 and 最近播放
  // have no folders to offer, which is what tells the two apart.
  const firstRun = onAdd !== undefined && !filtered && videos.length === 0;
  return (
    <>
      {/* How much there is. It is not the number of cards below — the page holds
          one page of a list (ADR 0016) — and it is said here, above the list,
          because it is a statement about the library rather than about the page:
          the footer's range is the page's (drawing `_2` keeps the count over the
          cards; `_8` keeps the range under them). Nothing is said until the
          backend has answered, since a count of nothing is a claim. */}
      {!collection.isPending && (
        <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {t('videoCount', { countText: count(total) })}
        </p>
      )}
      <div className="min-h-0 flex-1 flex flex-col">
        {collection.isPending || (videos.length === 0 && total > 0) ? (
          // The list is being read: either the backend has not answered yet, or
          // it has answered a page that is no longer there — a rescan can
          // shorten the list under the user — and the library is putting the
          // index back on the last page that exists. Neither is "the library is
          // empty", and drawing it as one would say something false about a
          // library that still holds records. A page of a non-empty list that
          // holds none is exactly this, and it is the only thing that is: the
          // index is clamped (`useLibrary`), so a page at a valid index has its
          // records.
          <p className="py-8 text-muted-foreground">{t('loading')}</p>
        ) : videos.length === 0 ? (
          <ScrollViewport>
            <EmptyState
              variant={firstRun ? 'hero' : 'plain'}
              icon={
                filtered ? (
                  <SearchX />
                ) : firstRun ? (
                  <FolderPlus />
                ) : (
                  <VideoOff />
                )
              }
              title={filtered ? t('noMatch') : emptyTitle}
              message={filtered ? t('noMatchHelp') : emptyHelp}
              hints={firstRun ? [t('welcomeFormats')] : undefined}
              action={
                filtered ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    {t('clear')}
                  </Button>
                ) : (
                  onAdd && (
                    <Button onClick={onAdd}>
                      <FolderPlus aria-hidden="true" />
                      {t('add')}
                    </Button>
                  )
                )
              }
            />
          </ScrollViewport>
        ) : (
          <ScrollViewport
            key={collectionKey}
            style={hoverRoomStyle}
            className="min-h-0 flex-1 overscroll-contain"
            tabIndex={0}
            aria-label={listLabel}
            onScroll={onScroll}
          >
            <VideoBoard
              videos={videos}
              viewMode={viewMode}
              busy={busy}
              actions={actions}
              lastPlayedId={lastPlayedId}
              scan={scan}
              onMenu={onMenu}
            />
          </ScrollViewport>
        )}
      </div>
      {/* Which part of the list is on screen, and the way to the rest of it. It
          is the footer's because it is about the page, not about the library;
          a list that fits on one page has no footer at all. */}
      <Pagination
        index={index}
        total={total}
        onPageChange={turnTo}
        className="shrink-0 mt-4"
      />
      {overlays}
    </>
  );
}
