import { useTranslation } from 'react-i18next';
import { FolderPlus } from 'lucide-react';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { Pager } from './Pager';
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
  const { t } = useTranslation();
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
  return (
    <>
      {/* How much there is, and how to read the rest of it. It is not the number
          of cards below — the page holds one page of a list (ADR 0016) — so the
          count and the way to the other pages are one thing, said in one place. */}
      <Pager index={index} total={total} onPageChange={turnTo} />
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
      {overlays}
    </>
  );
}
