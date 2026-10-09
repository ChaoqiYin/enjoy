import { useTranslation } from 'react-i18next';
import type { ScanStatus } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Button } from '../../shared/ui/button';
import { Progress } from '../../shared/ui/progress';
import { Spinner } from '../../shared/ui/spinner';

/**
 * A rebuild of the whole library's previews, while it is running: how far it
 * has come, which file it is on, and the two ways to stop it.
 *
 * It is its own component rather than the scan panel with a word changed
 * because the two say different things — a scan discovers files, a rebuild
 * already knows them all and is walking a list — and the difference is the
 * length of that list, which is what a progress bar needs and a scan does not
 * have until it has finished discovering.
 *
 * The bar is drawn from the counts rather than animated, so what the screen
 * shows and what a screen reader is told come from the same number. Before
 * there is a count there is no bar to draw a length from, so the placeholder is
 * the spinner: it says work is happening without inventing a length.
 *
 * Pausing and continuing are `warning` and `success`, and stopping is the
 * neutral one — it is a close, not a removal.
 */
export function ThumbnailProgress({
  status,
  onAction,
}: {
  status: ScanStatus;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  const { t, i18n } = useTranslation();
  const paused = status.phase === 'paused';
  const label = t('thumbnailSummary', {
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
          {paused ? t('resume') : t('pauseRegeneration')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => onAction('cancel')}
        >
          {t('cancelRegeneration')}
        </Button>
      </div>
    </section>
  );
}
