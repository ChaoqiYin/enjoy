import { FolderOpen, Heart, Play, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../shared/Tooltip';
import type { Video } from '../../shared/api';

export interface VideoActionHandlers {
  details: (video: Video) => void;
  play: (video: Video) => void;
  favorite: (video: Video) => void;
  reveal: (video: Video) => void;
  remove: (video: Video) => void;
  regenerate: (video: Video) => void;
  refreshInfo?: (video: Video) => void;
}

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
    <div
      className={
        iconOnly ? 'flex shrink-0 items-center gap-1.5' : 'flex flex-wrap gap-2'
      }
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Tooltip text={t('play')}>
        <button
          className={
            iconOnly
              ? 'btn btn-outline btn-xs btn-square btn-primary'
              : 'btn btn-outline btn-sm btn-primary'
          }
          disabled={busy || !video.available}
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
    </div>
  );
}
