import { motion, useReducedMotion } from 'motion/react';
import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration } from '../../shared/format';
import { BorderGlow } from '../../shared/ui/border-glow';
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
 * The cursor, the outline and the card's surfaces are CSS; the press scale is
 * the animation library's. That split is not a preference: two writers of one
 * property is the defect ADR 0007 records, where a Tailwind translation and the
 * library's summed and the element overshot before snapping back. One writer
 * per property, whichever writer it is — and the surfaces have theirs outside
 * this element altogether, on the `BorderGlow` that wraps it (ADR 0021), so
 * nothing here writes them at all.
 *
 * The hover lift is gone. It was there to say the card was live, and the border
 * glow says it without moving anything — the card stays put and only the light
 * travels (ADR 0021). What the library still drives is the press.
 *
 * Where the card's surfaces come from is worth saying once, because the daisyUI
 * classes it used to wear are gone: it clips itself (`overflow-hidden`) and
 * inherits its corner radius from the `BorderGlow` around it
 * (`rounded-[inherit]`), so the radius has one source rather than two. The
 * hover outline is drawn inside the border with a negative `outline-offset` so
 * the grid's clip never eats its first row's or column's edge.
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
  // The press is the only movement left, and the preference withholds it. The
  // `MotionConfig` the app provides is not enough on its own: under the
  // preference the library applies transform values instantly rather than
  // skipping them, so a press would still shrink the card 2%, just without the
  // transition — and a jump with no transition is the worse of the two. The
  // outline and the glow are untouched either way: one is a CSS transition on
  // this element, the other changes colour and opacity only, and neither is a
  // target value handed to the library.
  const reduceMotion = useReducedMotion();
  // The card's surfaces are the glow's rather than this element's: `glow-card`
  // brings the resting border and the elevation from the theme, the component
  // writes the corner radius inline, and the card below inherits that radius so
  // its own clip matches (ADR 0021). The radius is 10, and it is the one figure
  // here that no rule derives: `rounded-md`'s own 5 was tried first — it is the
  // primary button's corner, so a card and the button beside it were cut the
  // same — and read as too square at a card's width. Ten is where the curve
  // stops looking like a clipped box. Nothing raises the hovered card above its
  // neighbours either: the glow is thrown 10px and the grid's gap is 16, so it
  // never reaches the card next to it, and a later card painting over an
  // earlier one has nothing to paint over.
  //
  // `bg-card` is the one surface that is this element's, and it is here because
  // the glow cannot do it alone: the glow paints the card's fill and its border
  // gradient in one layer under one `opacity`, and that opacity is the border's
  // — so the fill is translucent by however faint the border happens to be, and
  // whatever is behind the card shows through the card. Over a window with a
  // dot matrix behind it, that is a scatter of dots across the card's own text.
  // Laying an opaque `--card` underneath changes no colour — it is the same
  // value the glow would have painted, at full strength — and stops everything
  // behind the card at the card's edge.
  return (
    <BorderGlow borderRadius={10} className="glow-card cursor-pointer bg-card">
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
        // The outline is worn by the pointer and by the keyboard: transparent at
        // rest, raised by the pointer in a wash of the foreground, and by the
        // keyboard in `--ring` — the colour the rest of the app focuses with. The
        // pointer's is one pixel and the keyboard's stays two, because the focus
        // ring is the only thing telling a keyboard user where they are; the
        // widths are written per state rather than shared, and an outline takes no
        // space, so the card does not resize either way (ADR 0021).
        //
        // The elevation and the border are not here. They belong to the
        // `BorderGlow` this card sits in, which paints the background, the border
        // and the resting shadow, and lights the border along whichever edge the
        // pointer is near (ADR 0021). `duration-200` matches the press, which is
        // the only movement left on this element.
        className="group relative flex flex-1 cursor-pointer flex-col overflow-hidden rounded-[inherit] text-card-foreground outline-1 -outline-offset-1 outline-transparent transition-[outline-color] duration-200 hover:outline-foreground/30 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => actions.details(video)}
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
          <HoverPlayOverlay
            disabled={busy}
            onPlay={() => actions.play(video)}
          />
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
    </BorderGlow>
  );
}
