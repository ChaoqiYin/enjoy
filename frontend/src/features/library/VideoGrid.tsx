import type { ComponentProps } from 'react';
import { virtualGridLayout } from '../../shared/VirtualGrid';
import { useContentWidth } from '../../shared/useContentWidth';
import { VideoCard } from './VideoCard';
import { hoverRoom } from './videoCardBox';
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
 * places: how many columns a width has room for, and the room the first column's
 * hover feedback needs. Neither is written down here — both come from where they
 * are already declared, so a change to either is a change to both grids.
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
        // The scroll viewport clips at its padding box, which is exactly where
        // the first column puts the outward half of a card's hover — so the same
        // room the virtual grid keeps is kept here, and taken back with a margin
        // of the same value so that nothing in the static layout moves.
        paddingInlineStart: hoverRoom,
        marginInlineStart: -hoverRoom,
      }}
    >
      {videos.map((video) => (
        <VideoCard key={video.id} {...props} video={video} />
      ))}
    </div>
  );
}
