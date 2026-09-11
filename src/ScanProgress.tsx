import { useTranslation } from 'react-i18next';
import type { ScanStatus } from './api';

export function ScanProgress({
  status,
  onAction,
}: {
  status: ScanStatus;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  const { t, i18n } = useTranslation();
  const paused = status.phase === 'paused';
  const label = t('scanSummary', {
    phase: paused ? t('paused') : t('scanning'),
    found: status.discovered.toLocaleString(i18n.language),
    processed: status.processed.toLocaleString(i18n.language),
  });
  const progress = Math.min(status.processed, status.discovered);
  return (
    <section
      aria-live="polite"
      className="rounded-box bg-base-200 p-4 space-y-3"
    >
      <p>{label}</p>
      {status.discovered > 0 && (
        <p className="text-sm">
          {t('scanStages', {
            indexed: status.indexed.toLocaleString(i18n.language),
            metadata: status.metadataReady.toLocaleString(i18n.language),
            thumbnails: status.thumbnailsReady.toLocaleString(i18n.language),
            total: status.discovered.toLocaleString(i18n.language),
          })}
        </p>
      )}
      {status.discovered > 0 ? (
        <div className="flex items-center gap-3">
          <progress
            className="progress flex-1"
            value={progress}
            max={status.discovered}
            aria-label={label}
          />
          <span className="tabular-nums">
            {new Intl.NumberFormat(i18n.language, {
              style: 'percent',
              maximumFractionDigits: 0,
            }).format(progress / status.discovered)}
          </span>
        </div>
      ) : (
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
      )}
      <p className="truncate" title={status.currentPath}>
        {status.currentPath}
      </p>
      <button
        className="btn"
        onClick={() => onAction(paused ? 'resume' : 'pause')}
      >
        {paused ? t('resume') : t('pause')}
      </button>
      <button className="btn" onClick={() => onAction('cancel')}>
        {t('cancelScan')}
      </button>
    </section>
  );
}
