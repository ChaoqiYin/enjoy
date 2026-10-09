import type { ScanStatus, Video } from '../../shared/api';
import { VideoCard } from './VideoCard';
import { VideoRow } from './VideoRow';
import { VideoTable } from './VideoTable';
import type { VideoActionHandlers } from './VideoActions';
import type { MenuTarget } from './VideoMenu';

/** The three ways the library can be read. */
export type ViewMode = 'grid' | 'list' | 'table';

/**
 * The records of one page, drawn the way the user asked to read them.
 *
 * It is presentation and nothing else: it is handed records that are already
 * selected, sorted and cut to a page, and it hands back the three shapes that
 * differ only in what they have room for. Which mode is in force, where the
 * page's records come from, and what happens between one page and the next are
 * the page's business — this component has no state, opens nothing and fetches
 * nothing, so a second caller (the 共享清单, a search) can draw the same three
 * modes over a list it built itself.
 *
 * The three modes are three layouts of the same facts rather than three
 * features: each renders one of `VideoCard`, `VideoRow` or `VideoTable` for
 * every record and passes the same handlers through. Nothing here decides what
 * a record can be asked, so a new action is added in one place
 * (`VideoActions`) and reaches all three.
 *
 * The grid's columns are the design document's breakpoints rather than a
 * measured count: at the widths the library is laid out at, the four steps
 * line up with what the measured layout would give, and a static grid needs no
 * width observer, no re-layout pass and no measurement to be correct on the
 * first paint. The gap is the same 16 pixels at every width.
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
  onMenu,
}: {
  videos: Video[];
  viewMode: ViewMode;
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  scan?: ScanStatus;
  onMenu?: (target: MenuTarget) => void;
}) {
  if (viewMode === 'table') {
    return (
      <VideoTable
        videos={videos}
        busy={busy}
        actions={actions}
        lastPlayedId={lastPlayedId}
        onMenu={onMenu}
      />
    );
  }
  if (viewMode === 'list') {
    // A real list, so a reader hears how many records there are before the
    // records themselves; the rows are the list's own children rather than
    // wrapped in anything, which is what makes that count right.
    return (
      <ul className="flex list-none flex-col gap-2 p-0">
        {videos.map((video) => (
          <VideoRow
            key={video.id}
            video={video}
            busy={busy}
            actions={actions}
            lastPlayedId={lastPlayedId}
            scan={scan}
            onMenu={onMenu}
          />
        ))}
      </ul>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          busy={busy}
          actions={actions}
          lastPlayedId={lastPlayedId}
          scan={scan}
          onMenu={onMenu}
        />
      ))}
    </div>
  );
}
