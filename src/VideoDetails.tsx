import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video } from './api';
import { duration, fileSize } from './format';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';

export function VideoDetails({
  video,
  scan,
  busy,
  actions,
  onClose,
}: {
  video: Video;
  scan?: ScanStatus;
  busy: boolean;
  actions: VideoActionHandlers;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const values = [
    [t('duration'), duration(video.duration_ms)],
    [
      t('resolution'),
      video.width ? `${video.width} × ${video.height}` : t('unknown'),
    ],
    [t('codec'), video.codec ?? t('unknown')],
    [t('fileSize'), fileSize(video.file_size, i18n.language)],
    [t('playCount'), video.play_count.toLocaleString(i18n.language)],
    [
      t('lastPlayed'),
      video.last_played_at
        ? new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(video.last_played_at)
        : t('neverPlayed'),
    ],
  ];
  return (
    <dialog
      ref={dialog}
      className="modal modal-end"
      aria-labelledby="video-details-title"
      onClose={onClose}
    >
      <div className="modal-box h-full max-h-full w-full max-w-xl rounded-none space-y-5">
        <form method="dialog" className="text-right">
          <button className="btn">{t('closeDetails')}</button>
        </form>
        <h2 id="video-details-title" className="text-2xl font-bold">
          {t('details')}
        </h2>
        <Thumbnail
          path={video.thumbnail_path}
          name={video.file_name}
          videoPath={video.path}
          scan={scan}
        />
        <h3 className="text-xl break-all">{video.file_name}</h3>
        <p className="break-all text-sm opacity-70">{video.path}</p>
        {!video.available && <p className="text-warning">{t('unavailable')}</p>}
        <dl className="space-y-3">
          {values.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="opacity-60">{label}</dt>
              <dd className="text-right break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <VideoActions video={video} busy={busy} actions={actions} />
        <button
          className="btn"
          disabled={busy || !video.available}
          onClick={() => actions.regenerate(video)}
        >
          {t('regenerate')}
        </button>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>{t('close')}</button>
      </form>
    </dialog>
  );
}
