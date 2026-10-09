import type { ComponentProps } from 'react';
import { virtualGridLayout } from '../../shared/VirtualGrid';
import { useContentWidth } from '../../shared/useContentWidth';
import { VideoCard } from './VideoCard';
import type { Video } from '../../shared/api';

/**
 * The same cards in the same grid, with every card mounted.
 *
 * `VirtualVideos` is the grid for a library, which is one scroll area holding
 * nothing else and can be thousands of rows long. This is the grid for a list
 * the user picked one video at a time and that shares its scroll area with the
 * rest of a page — the 共享清单 on the sharing page. Two things follow from that:
 * nothing is virtualized (every card is mounted, and the row estimate and the
 * measuring that go with it are not needed), and the scroll container is
 * whatever the page already has, so this renders a grid and no viewport.
 *
 * What it keeps from the other one is the part that is the same fact in both
 * places: how many columns a width has room for. It is not written down here —
 * it comes from where it is already declared, so a change to it is a change to
 * both grids.
 *
 * The room the first column's hover feedback needs is **not** kept here, and
 * that is the whole of the correction this file needed: the room belongs to
 * whatever clips the cards, which is the page's scroll viewport rather than the
 * grid inside it (`videoCardBox.hoverRoomStyle` has the reason). A page that
 * gives the room to the viewport gets the same grid as the library, and this
 * one has nothing to say about it.
 */
export function VideoGrid({
  videos,
  ...props
}: Omit<ComponentProps<typeof VideoCard>, 'video'> & { videos: Video[] }) {
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const columns = Math.max(1, virtualGridLayout.getColumnCount(width));
  return (
    <div
      ref={ref}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: virtualGridLayout.gap,
      }}
    >
      {videos.map((video) => (
        <VideoCard key={video.id} {...props} video={video} />
      ))}
    </div>
  );
}
