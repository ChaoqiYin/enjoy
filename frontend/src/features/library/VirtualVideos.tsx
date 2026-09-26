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
      // Rounded, because that is what the measurement it stands in for reports:
      // `measureElement` reads `offsetHeight`, an integer. A fractional estimate
      // leaves a fraction of a pixel per row, and those add up down the grid.
      estimateRowHeight: (width, columns) =>
        Math.round(
          (((width - (columns - 1) * virtualGridLayout.gap) / columns -
            virtualGridLayout.cardBorder * 2) *
            9) /
            16 +
            virtualGridLayout.rowFooter,
        ),
      measurementKey: i18n.language,
    });
  // Room on the viewport's start edge for the hover feedback of the first row
  // and first column, which the padding-box clip cuts flat; taking it with a
  // negative margin of the same value is what keeps that growth out of the
  // static layout, so no card moves. The value and its derivation are in
  // `virtualGridLayout.hoverRoom`, the measurements in ADR 0008.
  const hoverRoom = virtualGridLayout.hoverRoom;
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
