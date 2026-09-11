import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { useVirtualCollection } from '../../shared/useVirtualCollection';
import { VirtualGrid, virtualGridLayout } from '../../shared/VirtualGrid';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { VideoCard } from './VideoCard';
import type { Video } from '../../shared/api';

export function VirtualVideos({
  onScroll,
  ...props
}: Omit<ComponentProps<typeof VideoCard>, 'video'> & {
  videos: Video[];
  onScroll: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { viewport, columns, rows, totalHeight, measureRow } =
    useVirtualCollection({
      items: props.videos,
      getItemKey: (video) => video.id,
      getColumnCount: virtualGridLayout.getColumnCount,
      estimateRowHeight: (width, columns) =>
        (((width - (columns - 1) * virtualGridLayout.gap) / columns) * 9) / 16 +
        100,
      measurementKey: i18n.language,
    });
  return (
    <ScrollViewport
      ref={viewport}
      className="min-h-0 flex-1 overscroll-contain"
      tabIndex={0}
      aria-label={t('library')}
      onScroll={onScroll}
    >
      <VirtualGrid
        columns={columns}
        totalHeight={totalHeight}
        rows={rows}
        measureRow={measureRow}
        renderItem={(video) => (
          <VideoCard key={video.id} {...props} video={video} />
        )}
      />
    </ScrollViewport>
  );
}
