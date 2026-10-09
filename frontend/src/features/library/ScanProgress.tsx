import { useTranslation } from 'react-i18next';
import type { ScanStatus } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Button } from '../../shared/ui/button';
import { Progress } from '../../shared/ui/progress';
import { Spinner } from '../../shared/ui/spinner';

/**
 * A scan in progress, while it is running: how far it has come, which file it is
 * on, and the two ways to stop it.
 *
 * It draws the same block as `ThumbnailProgress` because both passes say the
 * same things and only the words differ: a scan discovers files as it walks
 * them, so until it has found one there is nothing to draw a length from, and
 * the placeholder is the spinner. The bar is drawn from the counts rather than
 * animated, so what the screen shows and what a screen reader is told come from
 * the same number.
 *
 * Pausing and continuing are `warning` and `success`; stopping is the neutral
 * one — stopping a scan is a close, not a removal, and every other control in
 * this app that stops a running operation says it the same way
 * (`ThumbnailProgress`, `UpdateSetting`).
 */
export function ScanProgress({
  status,
  onAction,
  operation = 'scan',
}: {
  status: ScanStatus;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
  operation?: 'scan' | 'thumbnails';
}) {
  const { t, i18n } = useTranslation();
  const paused = status.phase === 'paused';
  const thumbnails = operation === 'thumbnails';
  const label = t(thumbnails ? 'thumbnailSummary' : 'scanSummary', {
    phase: paused
      ? t('paused')
      : thumbnails
        ? t('regeneratingAll')
        : t('scanning'),
    found: status.discovered.toLocaleString(i18n.language),
    processed: status.processed.toLocaleString(i18n.language),
  });
  const progress = Math.min(status.processed, status.discovered);
  const current = displayPath(status.currentPath);
  return (
    <section aria-live="polite" className="space-y-3">
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
          <Progress
            className="flex-1"
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
        <Spinner aria-hidden="true" />
      )}
      <p className="truncate" title={current}>
        {current}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant={paused ? 'success' : 'warning'}
          onClick={() => onAction(paused ? 'resume' : 'pause')}
        >
          {paused
            ? t('resume')
            : thumbnails
              ? t('pauseRegeneration')
              : t('pause')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => onAction('cancel')}
        >
          {thumbnails ? t('cancelRegeneration') : t('cancelScan')}
        </Button>
      </div>
    </section>
  );
}
