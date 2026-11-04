import type { ScanStatus, Video } from '../../shared/api';
import { VideoCard } from './VideoCard';
import { VideoRow } from './VideoRow';
import { VideoTable } from './VideoTable';
import type { VideoActionHandlers } from './VideoActions';
import type { ViewMode } from './listing';

/**
 * The records of one page, drawn the way the user asked to read them.
 *
 * It is presentation and nothing else: it is handed records that are already
 * selected, sorted and cut to a page, and it hands back the three shapes that
 * differ only in what they have room for. Which mode is in force, where the
 * page's records come from, and what happens between one page and the next are
 * the page's business — this component has no state, opens nothing and fetches
 * nothing.
 *
 * The three modes are three layouts of the same facts rather than three
 * features: each renders one of `VideoCard`, `VideoRow` or `VideoTable` for
 * every record and passes the same handlers through. Nothing here decides what
 * a record can be asked, so a new action is added in one place
 * (`VideoActions`) and reaches all three.
 *
 * The grid's columns follow the width the board is given, not the viewport.
 * `auto-fill` fits as many 200-pixel-minimum columns as the content width
 * allows, so widening the window adds columns instead of stretching the cards.
 * `auto-fill` rather than `auto-fit`: a last page short of a full row keeps the
 * column width a full page gave it instead of stretching. The gap is the same
 * 16 pixels at every width.
 *
 * The room the first row's and first column's hover feedback needs is **not**
 * taken here. It belongs to the element that clips the cards, which is the
 * page's scroll viewport and not this grid: an element's padding is inside its
 * own clip, so the room has to be given by the clipper with the matching
 * negative margin that pulls the box back (`hoverRoomStyle` in `videoCardBox`).
 * Whoever assembles the page owns that one line.
 */
export function VideoBoard({
  videos,
  viewMode,
  busy,
  actions,
  lastPlayedId,
  scan,
}: {
  videos: Video[];
  viewMode: ViewMode;
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  scan?: ScanStatus;
}) {
  return (
    <div data-testid="video-board" data-view-mode={viewMode}>
      {viewMode === 'table' ? (
        <VideoTable
          videos={videos}
          busy={busy}
          actions={actions}
          lastPlayedId={lastPlayedId}
        />
      ) : viewMode === 'list' ? (
        // A real list, so a reader hears how many records there are before the
        // records themselves; the rows are the list's own children rather than
        // wrapped in anything, which is what makes that count right.
        <ul className="flex list-none flex-col gap-2 p-0">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              busy={busy}
              actions={actions}
              lastPlayedId={lastPlayedId}
              scan={scan}
            />
          ))}
        </ul>
      ) : (
        <div
          data-testid="video-grid"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-4"
        >
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              busy={busy}
              actions={actions}
              lastPlayedId={lastPlayedId}
              scan={scan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
