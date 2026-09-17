import { motion, useReducedMotion } from 'motion/react';
import type { ScanStatus, Video } from '../../shared/api';
import { Tooltip } from '../../shared/Tooltip';
import { duration } from '../../shared/format';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import type { MenuTarget } from './VideoMenu';

export function VideoCard({
  video,
  onMenu,
  busy,
  actions,
  scan,
}: {
  video: Video;
  onMenu: (target: MenuTarget) => void;
  busy: boolean;
  actions: VideoActionHandlers;
  scan?: ScanStatus;
}) {
  // The preference has to drop the movement but keep the affordance: the
  // outline, the shadow and the cursor still say "this whole block is
  // clickable", they just stop moving. The `MotionConfig` the app provides is
  // not enough for that on its own — under the preference the library applies
  // transform values instantly rather than skipping them, so the card would
  // still jump 4 pixels up and 2% wider, only without the transition — hence
  // the hover target is withheld entirely here. The shadow is untouched by
  // that: it comes from the `:hover` rule `style.css` gives `.video-card`, not
  // from a target value handed to the library, so it fades in as usual while
  // the card stays put.
  const reduceMotion = useReducedMotion();
  const hover = reduceMotion ? undefined : { y: -4, scale: 1.02 };
  return (
    <motion.article
      key={video.id}
      tabIndex={0}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ video, x: event.clientX, y: event.clientY });
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
          onMenu({ video, x: rect.left, y: rect.top });
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          actions.details(video);
        }
      }}
      // daisyUI draws the card's outline 2px outside its edge, but the grid's
      // scroll viewport clips at the padding box — exactly where the first
      // column and first row put that edge — so an outward outline loses its
      // left and top sides there. Pulling it onto the card keeps it whole. The
      // offset is fixed rather than moved on hover because daisyUI's
      // `transition: outline` does not cover `outline-offset`: a hover-only
      // offset would snap back before the colour finished fading, dropping the
      // clipped sides instead of fading them. The focus ring daisyUI paints
      // uses the same geometry, so this fixes that too.
      // `video-card` is the hook `style.css` hangs the hover shadow on; the
      // shadow cannot come from the animation library, which interpolates
      // literal values only and so cannot reach the theme-varying colour.
      className="card card-border bg-base-200 cursor-pointer video-card -outline-offset-2 hover:outline-base-content/30"
      onClick={() => actions.details(video)}
      // The lift, the hover scale and the press scale are the only writers of
      // `transform` here — no Tailwind `hover:translate-*`, which would add a
      // second source for the same property and is the defect ADR 0007 records
      // (two displacements summing, so the element overshoots and snaps back).
      // The outline, the cursor and the shadow stay with CSS for the same
      // reason: one writer per property.
      whileHover={hover}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      // 0.2s is the clock the outline gets from daisyUI's `.card` and the one
      // `style.css` gives `.video-card` for the outline and the shadow, so all
      // three run on one clock rather than racing on two.
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Thumbnail
        videoPath={video.path}
        scan={scan}
        path={video.thumbnail_path}
        name={video.file_name}
      />
      <div className="card-body p-3 gap-1.5">
        <h2 className="card-title min-w-0 text-sm font-semibold leading-snug">
          <Tooltip text={video.file_name} className="block min-w-0 w-full">
            <button
              className="block min-w-0 w-full truncate text-left cursor-pointer"
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
          <span className="text-xs tabular-nums text-base-content/55">
            {duration(video.duration_ms)}
          </span>
          <VideoActions video={video} busy={busy} actions={actions} iconOnly />
        </div>
      </div>
    </motion.article>
  );
}
