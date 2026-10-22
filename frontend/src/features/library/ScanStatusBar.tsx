import { useTranslation } from 'react-i18next';
import type { ScanStatus } from '../../shared/api';
import { displayPath } from '../../shared/format';
import { Tooltip } from '../../shared/Tooltip';
import { Button } from '../../shared/ui/button';
import { Progress } from '../../shared/ui/progress';
import { Spinner } from '../../shared/ui/spinner';

/**
 * A media pass in progress, as a bar along the page rather than a window over
 * it.
 *
 * It used to be a `<dialog>` that could not be dismissed: a scan owned the
 * screen until it ended, and switching space, opening a record or starting a
 * scrape were all things the user could not do while it was there. The work is
 * a queued task now, and a queued task does not own the screen — the task page
 * is where it is watched in full, and this bar is the short of it: enough to
 * know it is happening, how far it has come, and the two ways to stop it
 * (spec #101).
 *
 * The words and the counts are the ones the panels in the task page use, so
 * the two places that talk about the same pass talk about it the same way. What
 * is left out is the file being worked on: a bar has room for one line, and the
 * file name is the part that has to be read in full to be worth reading.
 *
 * Pausing and continuing are `warning` and `success`; stopping is the neutral
 * one — stopping a pass is a close, not a removal, and every other control in
 * this app that stops a running operation says it the same way.
 */
export function ScanStatusBar({
  status,
  onAction,
}: {
  status: ScanStatus;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  const { t, i18n } = useTranslation();
  const paused = status.phase === 'paused';
  const thumbnails = status.operation === 'thumbnails';
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
    <section
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-card-foreground"
    >
      {status.discovered > 0 ? (
        <>
          <Progress
            className="w-24 shrink-0"
            value={progress}
            max={status.discovered}
            aria-label={label}
          />
          <span className="shrink-0 tabular-nums text-sm">
            {new Intl.NumberFormat(i18n.language, {
              style: 'percent',
              maximumFractionDigits: 0,
            }).format(progress / status.discovered)}
          </span>
        </>
      ) : (
        <Spinner className="shrink-0" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1 truncate">{label}</p>
      {/* The name is truncated, so the prompt completes it. It waits, like the
          native title it replaces, rather than answering the moment the pointer
          crosses it. */}
      {current && (
        <Tooltip asChild text={current} delayDuration={700}>
          <p className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">
            {current}
          </p>
        </Tooltip>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
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
          size="sm"
          variant="secondary"
          onClick={() => onAction('cancel')}
        >
          {thumbnails ? t('cancelRegeneration') : t('cancelScan')}
        </Button>
      </div>
    </section>
  );
}
