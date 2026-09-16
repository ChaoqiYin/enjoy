import { useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScanStatus, Video } from '../../shared/api';
import { duration, fileSize } from '../../shared/format';
import { MaintenanceButton } from './MaintenanceButton';
import { Thumbnail } from './Thumbnail';
import { VideoActions } from './VideoActions';
import type { VideoActionHandlers } from './VideoActions';
import { Tooltip } from '../../shared/Tooltip';

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
  const panel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement,
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [onClose]);
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
    <div
      className="drawer drawer-end fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-details-title"
    >
      <input
        type="checkbox"
        className="drawer-toggle"
        checked
        readOnly
        aria-hidden="true"
      />
      <div className="drawer-content" />
      <div className="drawer-side">
        <button
          className="drawer-overlay"
          aria-label={t('closeDetails')}
          onClick={onClose}
        />
        <div
          ref={panel}
          tabIndex={-1}
          className="bg-base-100 h-full w-full max-w-[440px] overflow-y-auto p-6 space-y-5 outline-none"
        >
          <div className="flex items-center justify-between">
            <h2 id="video-details-title" className="text-2xl font-bold">
              {t('details')}
            </h2>
            <button
              className="btn btn-soft btn-md btn-neutral"
              onClick={onClose}
            >
              {t('closeDetails')}
            </button>
          </div>
          <Thumbnail
            path={video.thumbnail_path}
            name={video.file_name}
            videoPath={video.path}
            scan={scan}
          />
          <h3 className="text-xl break-all">{video.file_name}</h3>
          <div className="flex items-start gap-2">
            <p className="break-all text-sm opacity-70 flex-1">{video.path}</p>
            <Tooltip text={t('copyPath')}>
              <button
                className="btn btn-outline btn-xs btn-square btn-info"
                aria-label={t('copyPath')}
                onClick={() => {
                  void actions
                    .copyPath(video)
                    .then((copiedOk) => setCopied(copiedOk));
                }}
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            </Tooltip>
            {copied && (
              <span className="text-success text-sm">{t('copied')}</span>
            )}
          </div>
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
          <section className="space-y-3">
            <h3 className="font-semibold">{t('fileMaintenance')}</h3>
            <div className="flex flex-wrap gap-3">
              <MaintenanceButton
                video={video}
                action={actions.regenerate}
                variant="secondary"
                icon={<RefreshCw size={18} aria-hidden="true" />}
                label={t('regenerate')}
                disabled={busy}
              />
              <MaintenanceButton
                video={video}
                action={actions.refreshInfo}
                variant="primary"
                icon={<RefreshCw size={18} aria-hidden="true" />}
                label={t('refreshInfo')}
                disabled={busy}
              />
            </div>
            {busy && <p className="text-sm opacity-60">{t('busy')}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
