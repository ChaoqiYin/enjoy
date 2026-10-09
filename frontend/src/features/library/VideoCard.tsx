import { motion, useReducedMotion } from 'motion/react';
import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration } from '../../shared/format';
import { HoverPlayOverlay } from './HoverPlayOverlay';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { VideoBadges } from './VideoBadges';
import type { MenuTarget } from './VideoMenu';

/**
 * One video as the grid draws it: its picture, its name and its duration, with
 * the marks it wears floating over the picture's corners.
 *
 * The card is the click target for the details panel — the whole block, not a
 * link inside it — so it is a tab stop of its own and answers Enter and Space
 * the way a press does. The controls it draws are the exception, and they claim
 * their own presses (`VideoActions`, `HoverPlayOverlay`).
 *
 * The cursor, the outline and the shadow are CSS; the lift, the hover scale and
 * the press scale are the animation library's. That split is not a preference:
 * two writers of one property is the defect ADR 0007 records, where a Tailwind
 * translation and the library's summed and the element overshot before snapping
 * back. One writer per property, whichever writer it is.
 *
 * Where the card's surfaces come from is worth saying once, because the daisyUI
 * classes it used to wear are gone: the clipping and the corner radius are its
 * own (`overflow-hidden rounded-xl`), not a rule hung on the picture area, and
 * the hover outline is drawn inside the border with a negative `outline-offset`
 * so the grid's clip never eats its first row's or column's edge.
 */
export function VideoCard({
  video,
  onMenu,
  busy,
  actions,
  lastPlayedId,
  scan,
}: {
  video: Video;
  onMenu?: (target: MenuTarget) => void;
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  scan?: ScanStatus;
}) {
  // The preference has to drop the movement but keep the affordance: the
  // outline, the shadow and the cursor still say "this whole block is
  // clickable", they just stop moving. The `MotionConfig` the app provides is
  // not enough for that on its own — under the preference the library applies
  // transform values instantly rather than skipping them, so the card would
  // still jump 4 pixels up and 2% wider, only without the transition — hence
  // the hover target is withheld entirely here. The outline and the shadow are
  // untouched by that: they are CSS transitions on the element, not target
  // values handed to the library, so they fade in as usual while the card stays
  // put.
  const reduceMotion = useReducedMotion();
  const hover = reduceMotion ? undefined : { y: -4, scale: 1.02 };
  return (
    <motion.article
      key={video.id}
      tabIndex={0}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu?.({ video, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('button')
        ) {
          return;
        }
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu?.({ video, x: rect.left, y: rect.top });
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          actions.details(video);
        }
      }}
      // The shadow's colour is the theme's own foreground rather than a fixed
      // black, so a lift reads as depth in the light theme and as a glow in the
      // dark one, and neither theme's card sits on a colour the other's does.
      // `transition-[box-shadow,outline-color]` is the clock the hover has to
      // share with the lift the library runs, which is 0.2s.
      //
      // The outline is worn by the pointer and by the keyboard, on one
      // mechanism: it is transparent at rest, the pointer raises it in a wash of
      // the foreground, and the keyboard raises it in `--ring` — the colour the
      // rest of the app focuses with. Its colour is what both change, so the
      // outline's width and offset never move and the card never resizes.
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm outline-2 -outline-offset-2 outline-transparent transition-[box-shadow,outline-color] duration-200 hover:outline-foreground/30 focus-visible:outline-ring hover:shadow-[0_16px_40px_-12px_color-mix(in_oklab,var(--foreground)_35%,transparent)]"
      onClick={() => actions.details(video)}
      whileHover={hover}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* The picture, and the two things that float over it. It is the card's
          first child because that is where the eye goes, not because anything
          clips it from there: the card clips itself, and the picture area being
          first no longer carries a rule with it (ADR 0017). */}
      <div className="relative">
        <Thumbnail
          videoPath={video.path}
          scan={scan}
          path={video.thumbnail_path}
          name={video.file_name}
        />
        <HoverPlayOverlay disabled={busy} onPlay={() => actions.play(video)} />
        <VideoBadges
          video={video}
          variant="overlay"
          lastPlayed={video.id === lastPlayedId}
        />
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <h2 className="min-w-0 text-sm font-semibold leading-snug">
          {/* The bubble belongs to the name and not to the title row: it opens
              when the name itself is reached, by pointer or by focus, so a short
              name pops it from over the name rather than from the empty space
              beside it. The anchor is the primitive's, which wraps the control
              rather than replacing it, so the classes that matter stay on the
              button: `w-full truncate` is what ellipsises a name too long for
              the row, and it only works because the anchor and the heading are
              `min-w-0` — a flex item's default `min-width: auto` would let the
              name hold the whole row open instead. */}
          <Tooltip text={video.file_name} className="block min-w-0">
            <button
              className="block w-full cursor-pointer truncate text-left"
              onClick={(event) => {
                event.stopPropagation();
                actions.details(video);
              }}
            >
              {video.file_name}
            </button>
          </Tooltip>
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-xs tabular-nums text-muted-foreground">
            {duration(video.duration_ms)}
          </span>
          {/* No play here: the picture's overlay carries it. */}
          <VideoActions
            video={video}
            busy={busy}
            actions={actions}
            iconOnly
            hidePlay
          />
        </div>
      </div>
    </motion.article>
  );
}
