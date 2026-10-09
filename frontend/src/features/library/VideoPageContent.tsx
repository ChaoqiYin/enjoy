import { useTranslation } from 'react-i18next';
import { FolderPlus, SearchX, VideoOff } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';
import { useVideos } from './useVideos';
import type { useVideoPageView } from './useVideoPageView';
import { useVideoBoard } from './useVideoBoard';
import { VirtualVideos } from './VirtualVideos';

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
        {collection.isPending ? (
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
          <VirtualVideos
            key={collectionKey}
            scan={scan}
            videos={videos}
            onMenu={onMenu}
            busy={busy}
            actions={actions}
            lastPlayedId={lastPlayedId}
            onScroll={onScroll}
          />
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
