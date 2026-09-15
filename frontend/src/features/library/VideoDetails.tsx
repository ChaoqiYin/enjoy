import { useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video } from '../../shared/api';
import { duration, fileSize } from '../../shared/format';
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
  const [copied, setCopied] = useState(false);
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
    [
      t('format'),
      video.file_name.includes('.')
        ? video.file_name.split('.').pop()?.toUpperCase()
        : t('unknown'),
    ],
    [t('fileSize'), fileSize(video.file_size, i18n.language)],
    [
      t('modifiedAt'),
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(video.modified_at),
    ],
  ];
  return (
    <dialog
      ref={dialog}
      className="drawer drawer-end"
      aria-labelledby="video-details-title"
      onClose={onClose}
    >
      <div className="drawer-side z-50">
        <div className="drawer-overlay" onClick={onClose} />
        <div className="bg-base-100 h-full w-full max-w-xl overflow-y-auto p-6 space-y-5">
          <form method="dialog" className="text-right">
            <button className="btn btn-soft btn-md btn-neutral">
              {t('closeDetails')}
            </button>
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
          <div className="flex items-start gap-2">
            <p className="break-all text-sm opacity-70 flex-1">{video.path}</p>
            <button
              className="btn btn-outline btn-xs btn-square btn-info"
              aria-label={t('copyPath')}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(video.path)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Copy size={14} aria-hidden="true" />
            </button>
            {copied && (
              <span className="text-success text-sm">{t('copied')}</span>
            )}
          </div>
          {!video.available && (
            <p className="text-warning">{t('unavailable')}</p>
          )}
          <dl className="space-y-3">
            {values.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="opacity-60">{label}</dt>
                <dd className="text-right break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <VideoActions
            video={video}
            busy={busy}
            actions={actions}
            iconOnly
            hideRemove
          />
          <button
            className="btn btn-soft btn-md btn-secondary"
            disabled={busy || !video.available}
            onClick={() => actions.regenerate(video)}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {t('regenerate')}
          </button>
          <button
            className="btn btn-soft btn-md btn-primary"
            disabled={busy || !video.available}
            onClick={() => actions.refreshInfo?.(video)}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {t('refreshInfo')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
