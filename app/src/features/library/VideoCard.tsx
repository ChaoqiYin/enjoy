import { motion, useReducedMotion } from 'motion/react';
import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration } from '../../shared/format';
import { BorderGlow } from '../../shared/ui/border-glow';
import { HoverPlayOverlay } from './HoverPlayOverlay';
import { pressOnPicture } from './picturePress';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { VideoBadges } from './VideoBadges';

/**
 * One video as the grid draws it: its picture, its name and its duration, with
 * the marks it wears floating over the picture's corners.
 *
 * The card is the click target for the details panel — the whole block except
 * the picture area, and not a link inside it — so it is a tab stop of its own
 * and answers Enter and Space the way a press does. The controls it draws are
 * the exception, and they claim their own presses (`VideoActions`,
 * `HoverPlayOverlay`); so does the picture, whose press plays.
 *
 * The picture adds no tab stop and no role of its own. Both acts stay at the
 * two stops the keyboard already had — Enter and Space on the card open the
 * panel, the named play button over the picture plays it — and the picture is a
 * pointer shortcut across a surface whose keyboard story is already complete.
 *
 * The cursor, the outline and the card's surfaces are CSS; the press scale is
 * the animation library's. That split is not a preference: two writers of one
 * property is the defect ADR 0007 records, where a Tailwind translation and the
 * library's summed and the element overshot before snapping back. One writer
 * per property, whichever writer it is — and the surfaces have theirs outside
 * this element altogether, on the `BorderGlow` that wraps it.
 *
 * The hover lift is gone. It was there to say the card was live, and the border
 * glow says it without moving anything — the card stays put and only the light
 * travels. What the library still drives is the press.
 *
 * The card clips itself (`overflow-hidden`) and inherits its corner radius from
 * the `BorderGlow` around it (`rounded-[inherit]`), so the radius has one source
 * rather than two. The hover outline is drawn inside the border with a negative
 * `outline-offset` so the grid's clip never eats its first row's or column's
 * edge.
 */
export function VideoCard({
  video,
  busy,
  actions,
  lastPlayedId,
  scan,
  pendingSharedPaths,
}: {
  video: Video;
  busy: boolean;
  actions: VideoActionHandlers;
  lastPlayedId: number | null;
  scan?: ScanStatus;
  pendingSharedPaths?: ReadonlySet<string>;
}) {
  // The press is the only movement left, and the preference withholds it. The
  // `MotionConfig` the app provides is not enough on its own: under the
  // preference the library applies transform values instantly rather than
  // skipping them, so a press would still shrink the card 2%, just without the
  // transition — and a jump with no transition is the worse of the two.
  const reduceMotion = useReducedMotion();
  // The card's surfaces are the glow's rather than this element's: `glow-card`
  // brings the resting border and the elevation from the theme, the component
  // writes the corner radius inline, and the card below inherits that radius so
  // its own clip matches. The radius is 10: `rounded-md`'s 5 read as too square
  // at a card's width, and ten is where the curve stops looking like a clipped
  // box. Nothing raises the hovered card above its neighbours either: the glow
  // is thrown 10px and the grid's gap is 16.
  //
  // `bg-card` is the one surface that is this element's, and it is here because
  // the glow cannot do it alone: the glow paints the card's fill and its border
  // gradient in one layer under one `opacity`, and that opacity is the border's
  // — so the fill is translucent by however faint the border happens to be, and
  // whatever is behind the card shows through the card. Over a window with a
  // dot matrix behind it, that is a scatter of dots across the card's own text.
  return (
    <BorderGlow borderRadius={10} className="glow-card cursor-pointer bg-card">
      <motion.article
        key={video.id}
        data-testid="video-card"
        data-video-id={video.id}
        data-favorite={String(video.favorite)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('button')
          ) {
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.details(video);
          }
        }}
        // The outline is worn by the pointer and by the keyboard: transparent at
        // rest, raised by the pointer in a wash of the foreground, and by the
        // keyboard in `--ring` — the colour the rest of the app focuses with.
        className="group relative flex flex-1 cursor-pointer flex-col overflow-hidden rounded-[inherit] text-card-foreground outline-1 -outline-offset-1 outline-transparent transition-[outline-color] duration-200 hover:outline-foreground/30 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => actions.details(video)}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* The picture, and the two things that float over it. It is the card's
          first child because that is where the eye goes. */}
        <div
          className="relative"
          data-slot="video-picture"
          // The picture area is the play target and not only the button drawn
          // over it: a press here plays, and it is claimed before the card's own
          // click can read it.
          onClick={(event) =>
            pressOnPicture(event, () => actions.play(video), !busy)
          }
        >
          <Thumbnail video={video} scan={scan} />
          <HoverPlayOverlay
            disabled={busy}
            onPlay={() => actions.play(video)}
          />
          <VideoBadges
            video={video}
            variant="overlay"
            lastPlayed={video.id === lastPlayedId}
            pendingShare={pendingSharedPaths?.has(video.path) ?? false}
          />
        </div>
        <div className="flex flex-col gap-1.5 p-3">
          <h2 className="min-w-0 text-sm font-semibold leading-snug">
            {/* The bubble belongs to the name and not to the title row: it opens
              when the name itself is reached, by pointer or by focus. The anchor
              is the primitive's, which wraps the control rather than replacing
              it, so `w-full truncate` stays on the button and only works
              because the anchor and the heading are `min-w-0`. */}
            <Tooltip text={video.fileName} className="block min-w-0">
              <button
                className="block w-full cursor-pointer truncate text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.details(video);
                }}
              >
                {video.fileName}
              </button>
            </Tooltip>
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-xs tabular-nums text-muted-foreground">
              {duration(video.durationMs)}
            </span>
            {/* No play here: the picture's overlay carries it. The row is the
                card's tightest line — a duration and the controls on one line
                inside a card padded by 12 — so its buttons take the smaller
                icon size. */}
            <VideoActions
              video={video}
              busy={busy}
              actions={actions}
              iconOnly
              iconSize="icon-xs"
              hidePlay
            />
          </div>
        </div>
      </motion.article>
    </BorderGlow>
  );
}
