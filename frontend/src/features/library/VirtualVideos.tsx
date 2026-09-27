import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { useVirtualCollection } from '../../shared/useVirtualCollection';
import { VirtualGrid, virtualGridLayout } from '../../shared/VirtualGrid';
import { ScrollViewport } from '../../shared/ScrollViewport';
import { VideoCard } from './VideoCard';
import { hoverRoom, rowHeight } from './videoCardBox';
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
        rowHeight(width, columns, virtualGridLayout.gap),
      measurementKey: i18n.language,
    });
  // Room on the viewport's start edge for the hover feedback of the first row
  // and first column, which the padding-box clip cuts flat; taking it with a
  // negative margin of the same value is what keeps that growth out of the
  // static layout, so no card moves. The value and its derivation are in
  // `videoCardBox.hoverRoom`, the measurements in ADR 0008.
  return (
    <ScrollViewport
      ref={viewport}
      style={{
        paddingTop: hoverRoom,
        paddingInlineStart: hoverRoom,
        marginTop: -hoverRoom,
        marginInlineStart: -hoverRoom,
      }}
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
