import type { ScanStatus, Video } from '../../shared/api';
import { VideoCard } from './VideoCard';
import { VideoRow } from './VideoRow';
import { VideoTable } from './VideoTable';
import type { VideoActionHandlers } from './VideoActions';
import type { MenuTarget } from './VideoMenu';
import type { ViewMode } from './listing';

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
 * The three shapes are the listing's vocabulary (`listing.ViewMode`, ADR 0017)
 * and not this file's: the switch that picks one and the query that reads the
 * list are two other readers of the same three words, and a fourth name for
 * them here would be a fourth thing to keep in step.
 *
 * The grid's columns follow the width the board is given, not the viewport.
 * `auto-fill` fits as many 240-pixel-minimum columns as the content width
 * allows, so widening the window adds columns instead of stretching the cards.
 * What it counts is the grid's own width, taken after the page's padding and the
 * scrollbar's reserved room have come off it — the rule 开发指南 states for this
 * grid, and the one the viewport breakpoints this replaced got wrong: a capped
 * content column stops answering to the window at all, so the columns froze at
 * three while the window kept growing. A browser lays this out from CSS alone and
 * is right on the first paint, so the constant count's objection does not apply:
 * no width observer, no re-layout pass, nothing here to keep in step with a
 * stylesheet. The minimum is a floor rather than a fixed width — the columns take
 * the slack, which keeps a card between 240 and 276 pixels at every size.
 * `auto-fill` rather than `auto-fit`: a last page short of a full row keeps the
 * column width a full page gave it instead of stretching. The gap is the same 16
 * pixels at every width. Full reasoning: ADR 0019.
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
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
