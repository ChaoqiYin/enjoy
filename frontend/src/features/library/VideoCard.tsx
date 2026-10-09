import { motion, useReducedMotion } from 'motion/react';
import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  lastPlayedId,
  scan,
}: {
  video: Video;
  onMenu: (target: MenuTarget) => void;
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
  // the hover target is withheld entirely here. The shadow is untouched by
  // that: it comes from the `:hover` rule `style.css` gives `.video-card`, not
  // from a target value handed to the library, so it fades in as usual while
  // the card stays put.
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();
  // What the 共享清单 glyph means, in the two places it has to be said.
  const shared = t('sharedMarker');
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
          {/* The anchor carrying `data-tip` is what the pointer has to reach:
              daisyUI opens the bubble on that element's `:hover`, which its
              descendants satisfy too, so an anchor spanning the whole title row
              pops the tip from the empty space beside the name. Worse, the
              bubble is aligned to the anchor's inline end, so a row-wide anchor
              parks it at the far edge of the card instead of over the name.
              `w-fit` brings the anchor back to the name's own box while
              `w-full` keeps the button filling it. `max-w-full` is what keeps
              the truncation: `w-fit` on its own lets a name that cannot wrap
              hold the anchor out at its own untruncated width, so the anchor
              runs past the row instead of ellipsising — measured in the
              browser at 435px of anchor inside a 226px row once the cap was
              dropped. With the cap, a name that fits gets a box exactly its
              size and a long one ellipsises at the row's edge. */}
          <Tooltip text={video.file_name} className="block w-fit max-w-full">
            <button
              className="block w-full truncate text-left cursor-pointer"
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
      {/* The marker the user last handed to the system player: a chip taken out
          of flow over the thumbnail's corner rather than a row in the body, so
          that no body row has to make room for it.

          It has to be the card's **last** child, not its first: the picture area
          is the first, and daisyUI's `.card figure:first-child` is what gives it
          the corner radius and the clipping that holds its height at 16:9.
          `:first-child` counts an absolutely positioned child — positioning
          moves the box, not the ordinal — so a marker placed ahead of the
          picture takes that rule away with it, and a thumbnail whose own ratio
          is not 16:9 (ffmpeg keeps the source ratio) then sets the height
          instead: measured on the built page at a 249.5px column, a played card
          over a portrait thumbnail comes out 505.92 tall against 205.31 for
          every other card, and the grid's `align-items: stretch` carries the row
          to 525.92, which no row estimate can follow. The position itself is
          asserted in `app/interface.test.tsx`, the ratio and the estimate in
          `videoCardBox`, and ADR 0009 records the measurement that missed this:
          its fixture was 1920×1080, where the two heights coincide.

          `badge-neutral` rather than a bare `badge`: measured on the built
          page, `--color-neutral` is `oklch(14% .005 285.823)` in **both**
          themes, where `base-100` is white in one and `oklch(25% …)` in the
          other. So this is one near-black chip with near-white text whichever
          theme is on — the same label over the same thumbnail either way, and
          15.68:1 within itself, which is what keeps the text readable over an
          arbitrary picture. The limit is the chip's own edge, not its text:
          over a very dark thumbnail a near-black box stops being visible as a
          box while its text still reads.

          The card's own outline is left alone — hover and focus already write
          it, and a second writer on one property is the defect ADR 0007
          records. Backgrounds would do the same to the card's surface, which
          is why the distinction is drawn on a new element. */}
      {video.id === lastPlayedId && (
        <span className="badge badge-sm badge-neutral absolute top-2 start-2">
          {t('lastPlayedMarker')}
        </span>
      )}
      {/* The 共享清单 mark, worn by the card the same way: over the thumbnail's
          other corner, so that the two never have to share a place — a video
          can be both the one just played and one of the ones being shared.

          A glyph rather than words, unlike the marker beside it: 「上次播放」 is a
          fact about this session that a user meets once, while being on the
          share list is a state the card wears until it is taken off, and a row
          of chips with a sentence in each is one the library can no longer be
          read at a glance. What the glyph means is still written down, in the
          two places a glyph that carries meaning has to be: `title` for the
          pointer, and the accessible name for a reader that has none.

          The colour is the one the navigation's lamp uses for a running
          service, because it is the same fact seen from a different place:
          green means sharing, and the pair — mint on the deep green it sits
          on — is daisyUI's rather than a green of our own.

          The fill is thinned to 80%, which is what keeps a saturated block of
          green from standing on a photograph it has nothing to do with; at full
          strength it read as pasted on. Thinned and no further, measured over
          three thumbnail tones (a near-black frame, a mid-grey one, a near-white
          one) in both themes: the glyph holds 3.47:1 / 4.37:1 / 5.42:1 there,
          where 70% falls to 2.73:1 over the darkest and 60% to 2.19:1 — under
          the 3:1 a graphic needs. The solid chip this replaced was 5.12:1 over
          every one of them, so what the thinning buys is the chip agreeing with
          the picture behind it, and what it spends is headroom on dark ones.
          `bg-success/80` rather than a hand-mixed colour because the utilities
          layer is what comes after the component class daisyUI sets the fill
          in; the numbers above are measured on the pair as it lands, not on the
          two colours as declared.

          It is the card's last child like the marker above it, and for the same
          reason (`:first-child` counts an absolutely positioned child — see
          that block). */}
      {video.shared && (
        <span
          className="badge badge-sm badge-success bg-success/80 absolute top-2 end-2"
          role="img"
          aria-label={shared}
          title={shared}
        >
          <Share2 size={12} aria-hidden="true" />
        </span>
      )}
    </motion.article>
  );
}
