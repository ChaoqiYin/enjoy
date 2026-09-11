import { useTranslation } from 'react-i18next';
import type { Video } from './api';

export interface VideoActionHandlers {
  details: (video: Video) => void;
  play: (video: Video) => void;
  favorite: (video: Video) => void;
  reveal: (video: Video) => void;
  remove: (video: Video) => void;
  regenerate: (video: Video) => void;
}

export function VideoActions({
  video,
  busy,
  actions,
}: {
  video: Video;
  busy: boolean;
  actions: VideoActionHandlers;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-wrap gap-2"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        className="btn btn-sm"
        disabled={busy || !video.available}
        onClick={() => actions.play(video)}
      >
        {t('play')}
      </button>
      <button
        className="btn btn-sm"
        disabled={busy}
        onClick={() => actions.favorite(video)}
      >
        {video.favorite ? t('unfavorite') : t('favorites')}
      </button>
      <button
        className="btn btn-sm"
        disabled={busy}
        onClick={() => actions.reveal(video)}
      >
        {t('reveal')}
      </button>
      <button
        className="btn btn-sm"
        disabled={busy}
        onClick={() => actions.remove(video)}
      >
        {t('removeIndex')}
      </button>
    </div>
  );
}
