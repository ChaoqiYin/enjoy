import { FolderOpen, Heart, Play, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../shared/Tooltip';
import type { Video } from '../../shared/api';

export interface VideoActionHandlers {
  details: (video: Video) => void;
  play: (video: Video) => void;
  favorite: (video: Video) => void;
  reveal: (video: Video) => void;
  remove: (video: Video) => void;
  copyPath: (video: Video) => Promise<void>;
  regenerate: (video: Video) => void | Promise<unknown>;
  refreshInfo: (video: Video) => void | Promise<unknown>;
}

// Motion only creates the press gesture that can claim the pointer press for an
// element that declares one, so this object stays empty on purpose: being truthy
// is the whole of its job, and the container itself does not move. It is named
// rather than inlined so that it does not read as a leftover to be deleted.
const CLAIM_TAP = {};

export function VideoActions({
  video,
  busy,
  actions,
  iconOnly = false,
  hideRemove = false,
}: {
  iconOnly?: boolean;
  hideRemove?: boolean;
  video: Video;
  busy: boolean;
  actions: VideoActionHandlers;
}) {
  const { t } = useTranslation();
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
      // the card's own listener on the element — and would, even from the
      // capture phase where it does work, keep the event from reaching the
      // window listener the context menu closes itself with. The tap target is
      // `CLAIM_TAP` above. `tabIndex` keeps that gesture from turning the
      // container into a tab stop of its own.
      whileTap={CLAIM_TAP}
      propagate={{ tap: false }}
      tabIndex={-1}
    >
      <Tooltip text={t('play')}>
        <button
          className={
            iconOnly
              ? 'btn btn-outline btn-xs btn-square btn-primary'
              : 'btn btn-outline btn-sm btn-primary'
          }
          disabled={busy}
          onClick={() => actions.play(video)}
          aria-label={t('play')}
        >
          {iconOnly ? <Play size={14} aria-hidden="true" /> : t('play')}
        </button>
      </Tooltip>
      <Tooltip text={video.favorite ? t('unfavorite') : t('favorites')}>
        <button
          className={
            iconOnly
              ? 'btn btn-outline btn-xs btn-square btn-secondary'
              : 'btn btn-outline btn-sm btn-secondary'
          }
          disabled={busy}
          onClick={() => actions.favorite(video)}
          aria-label={video.favorite ? t('unfavorite') : t('favorites')}
          aria-pressed={video.favorite}
        >
          {iconOnly ? (
            <Heart
              size={14}
              fill={video.favorite ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          ) : video.favorite ? (
            t('unfavorite')
          ) : (
            t('favorites')
          )}
        </button>
      </Tooltip>
      <Tooltip text={t('reveal')}>
        <button
          className={
            iconOnly
              ? 'btn btn-outline btn-xs btn-square btn-info'
              : 'btn btn-outline btn-sm btn-info'
          }
          disabled={busy}
          onClick={() => actions.reveal(video)}
          aria-label={t('reveal')}
        >
          {iconOnly ? <FolderOpen size={14} aria-hidden="true" /> : t('reveal')}
        </button>
      </Tooltip>
      {!hideRemove && (
        <Tooltip text={t('removeIndex')}>
          <button
            className={
              iconOnly
                ? 'btn btn-outline btn-xs btn-square btn-error'
                : 'btn btn-outline btn-sm btn-error'
            }
            disabled={busy}
            onClick={() => actions.remove(video)}
            aria-label={t('removeIndex')}
          >
            {iconOnly ? (
              <Trash2 size={14} aria-hidden="true" />
            ) : (
              t('removeIndex')
            )}
          </button>
        </Tooltip>
      )}
    </motion.div>
  );
}
