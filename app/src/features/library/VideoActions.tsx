import type { ReactNode } from 'react';
import { FolderOpen, Heart, Play, Share2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import type { ButtonProps } from '../../shared/ui/button';
import { Tooltip } from '../../shared/Tooltip';

/**
 * What the places a video is drawn can ask of it.
 *
 * The old build's set also carried removal from the index and the two media
 * commands; this build has no route behind any of those, so the set is the
 * four the backend answers: details, play, favourite and sharing, plus
 * revealing the file in the platform's folder window.
 */
export interface VideoActionHandlers {
  details: (video: Video) => void;
  play: (video: Video) => void;
  favorite: (video: Video) => void;
  share: (video: Video) => void;
  /** Left out where the shell cannot reveal a file: the browser build has no
   *  folder window to show, so the control is not drawn at all rather than
   *  drawn and doing nothing. */
  reveal?: (video: Video) => void;
}

// Motion only creates the press gesture that can claim the pointer press for an
// element that declares one, so this object stays empty on purpose: being truthy
// is the whole of its job, and the container itself does not move. It is named
// rather than inlined so that it does not read as a leftover to be deleted.
const CLAIM_TAP = {};

/**
 * The controls every place a video is drawn offers: the card, the compact row,
 * the table's last cell and the details panel.
 *
 * One set rather than four, because the four places differ in what they have
 * room for and not in what can be asked of a video — so the difference is
 * expressed by leaving controls out (`iconOnly`, `hidePlay`) rather than by a
 * second copy of them.
 *
 * Each control carries its own accessible name, which is what lets the
 * icon-only form say as much as the labelled one, and each keeps the colour the
 * interface already gave that action: play is the emphatic one, a favourite and
 * a shared record are the secondary marks, and showing the file is the
 * informational one. A mark that is on wears the secondary fill and says so
 * through `aria-pressed`, so the state survives a theme that redraws the glyph.
 *
 * `hidePlay` exists because the two views that draw a picture hand the play
 * affordance to the overlay on it (`HoverPlayOverlay`): one action, one control,
 * one name, rather than two controls a reader would hear as the same word.
 *
 * `iconSize` is the one place the four callers differ in shape rather than in
 * what they leave out, and it is the card that differs: its controls sit on the
 * same line as the duration, inside a card whose padding is already tight, so
 * it asks for `icon-xs` — the same 14-pixel glyph in a 20-pixel button with a
 * 3-pixel corner. The other three keep `icon-sm`, the interface's icon button.
 */
export function VideoActions({
  video,
  busy,
  actions,
  iconOnly = false,
  iconSize = 'icon-sm',
  hidePlay = false,
}: {
  iconOnly?: boolean;
  iconSize?: ButtonProps['size'];
  hidePlay?: boolean;
  video: Video;
  busy: boolean;
  actions: VideoActionHandlers;
}) {
  const { t } = useTranslation();
  const favorite = video.favorite ? t('unfavorite') : t('favorite');
  const share = video.shared ? t('unshare') : t('share');
  const size: ButtonProps['size'] = iconOnly ? iconSize : 'sm';
  const control = (
    label: string,
    variant: ButtonProps['variant'],
    onClick: () => void,
    icon: ReactNode,
    pressed?: boolean,
    testid?: string,
  ) => (
    <Tooltip text={label}>
      <Button
        data-testid={testid}
        variant={variant}
        size={size}
        disabled={busy}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {iconOnly ? (
          icon
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>
    </Tooltip>
  );
  return (
    <motion.div
      className={
        iconOnly ? 'flex shrink-0 items-center gap-1.5' : 'flex flex-wrap gap-2'
      }
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      // Pressing one of these buttons must not dip the card, and the boundary
      // for the card's press gesture is the animation library's own: a nested
      // motion element that declares a tap gesture and turns `propagate.tap`
      // off makes the library mark the `pointerdown` as taken, and the card
      // skips events another element has claimed. Stopping propagation would
      // not do it from a bubble handler — React runs those at the root, after
      // the card's own listener on the element. `tabIndex` keeps that gesture
      // from turning the container into a tab stop of its own.
      whileTap={CLAIM_TAP}
      propagate={{ tap: false }}
      tabIndex={-1}
    >
      {!hidePlay &&
        control(
          t('play'),
          'primary',
          () => actions.play(video),
          <Play size={14} aria-hidden="true" />,
          undefined,
          'play-video',
        )}
      {control(
        favorite,
        video.favorite ? 'secondary' : 'outline',
        () => actions.favorite(video),
        <Heart
          size={14}
          fill={video.favorite ? 'currentColor' : 'none'}
          aria-hidden="true"
        />,
        video.favorite,
        'favorite-video',
      )}
      {control(
        share,
        video.shared ? 'secondary' : 'outline',
        () => actions.share(video),
        <Share2 size={14} aria-hidden="true" />,
        video.shared,
        'share-video',
      )}
      {actions.reveal &&
        control(
          t('reveal'),
          'info',
          () => actions.reveal?.(video),
          <FolderOpen size={14} aria-hidden="true" />,
          undefined,
          'reveal-video',
        )}
    </motion.div>
  );
}
