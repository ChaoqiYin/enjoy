import { useTranslation } from 'react-i18next';
import { Download, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import packageInfo from '../../../../package.json';
import type { AvailableUpdate, UpdateProgress } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Progress } from '../../shared/ui/progress';
import { useScan } from '../library/useScan';
import { useUpdateContext } from './UpdateProvider';
import { formatBytes, formatReleaseDate, progressRatio } from './updateFormat';

export function UpdateSetting() {
  const { t } = useTranslation();
  const update = useUpdateContext();
  const { isRunning: scanning } = useScan();
  const check = update.check;
  const available = check?.available ?? null;
  const ready = check?.readyToRestart ?? false;
  const busy = update.checking || update.downloading;
  // Installing exits the process, so a pass in flight would be lost. The
  // backend refuses this outright; disabling here is only so the user is not
  // invited to press a button that cannot work.
  // The same vocabulary the scan's progress block uses, so pausing, continuing
  // and cancelling mean the same thing wherever they appear. Continuing is not
  // a control sent to the backend: it is the download started again from what
  // was kept, which is the call the first press made.
  const control = (action: 'pause' | 'resume' | 'cancel') => {
    if (action === 'pause') update.pause();
    else if (action === 'cancel') update.cancel();
    else update.install();
  };
  return (
    <div className="space-y-3">
      {/* The card's own heading names the section this block now shares with the
          language and the theme; this is the block's heading, the way those two
          each carry theirs. */}
      <h3 className="text-sm font-medium">{t('updateTitle')}</h3>
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t('updateCurrent', {
            // The backend compares the version it is built with; the bundled
            // one only stands in until the first check answers.
            version: check?.currentVersion ?? packageInfo.version,
          })}
        </p>
        {/* Always offered. Only this button starts a check, so whether the
            platform has published updates is unknown until it is pressed, and
            an answer of "none" arrives as a notice rather than by taking away
            the button the user just pressed. */}
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={update.checkNow}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {update.checking ? t('updateChecking') : t('updateCheck')}
        </Button>
      </div>

      {(update.downloading || update.paused) && (
        <UpdateProgressBlock
          progress={update.progress}
          paused={update.paused}
          onAction={control}
        />
      )}

      {/* The offer and the progress block are alternatives: while a download is
          running or paused, the buttons it needs are the ones in that block,
          and a download button beside them would offer to start a second. */}
      {available && !update.downloading && !update.paused && (
        <div className="space-y-3">
          {/* The button stays on the version line rather than below the notes:
              a long release would otherwise push it out of the viewport, and
              this section scrolls with the page rather than holding its own
              scroll area the way the dialog it replaced did. */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {ready
                ? t('updateReady', { version: available.version })
                : t('updateAvailable', { version: available.version })}
            </p>
            {ready ? (
              <Button
                size="sm"
                disabled={scanning || update.restarting}
                onClick={update.restart}
              >
                <RotateCw size={14} aria-hidden="true" />
                {update.restarting ? t('updateRestarting') : t('updateRestart')}
              </Button>
            ) : (
              <Button size="sm" onClick={update.install}>
                <Download size={14} aria-hidden="true" />
                {t('updateDownload')}
              </Button>
            )}
            {ready && scanning && (
              <p className="text-sm text-muted-foreground">
                {t('updateRestartBlocked')}
              </p>
            )}
          </div>
          <ReleaseNotes available={available} />
        </div>
      )}
    </div>
  );
}

/**
 * What the check said the release contains, shown in the section rather than in
 * a dialog: it is what the decision to download rests on, so it belongs next to
 * the button that makes that decision.
 */
function ReleaseNotes({ available }: { available: AvailableUpdate }) {
  const { t, i18n } = useTranslation();
  const released = available.date
    ? formatReleaseDate(available.date, i18n.language)
    : null;
  // An unreadable date costs its own line and nothing else: the notes below it
  // are what the download decision rests on, and they do not depend on it.
  if (!released && !available.notes) return null;
  return (
    <div className="space-y-2">
      {released && (
        <p className="text-sm text-muted-foreground">
          {t('updateReleasedAt', { date: released })}
        </p>
      )}
      {available.notes && (
        <>
          <h4 className="text-sm font-medium">{t('updateNotes')}</h4>
          {/* Release notes come from our own release manifest, but they are
              still text fetched over the network: rendered as plain text,
              never as markup. No height cap: this section already scrolls
              with the page, and a second scroll area would trap the wheel and
              hide the very text the button was pressed to read. */}
          <p className="text-sm break-words whitespace-pre-wrap">
            {available.notes}
          </p>
        </>
      )}
    </div>
  );
}

function UpdateProgressBlock({
  progress,
  paused,
  onAction,
}: {
  progress: UpdateProgress | null;
  paused: boolean;
  onAction: (action: 'pause' | 'resume' | 'cancel') => void;
}) {
  const { t, i18n } = useTranslation();
  const downloaded = progress?.downloaded ?? 0;
  const total = progress?.total ?? null;
  const ratio = progressRatio(downloaded, total);
  const label = t(paused ? 'updatePaused' : 'updateDownloading');
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
    >
      <p>{label}</p>
      {ratio === null ? (
        // Decorative rather than the `Spinner` primitive: this block already
        // announces itself, and a second live region inside it would report the
        // wait twice.
        <Loader2
          size={16}
          aria-hidden="true"
          className="animate-spin text-muted-foreground"
        />
      ) : (
        <div className="flex items-center gap-3">
          <Progress
            className="flex-1"
            value={downloaded}
            max={total ?? undefined}
            aria-label={label}
          />
          <span className="tabular-nums">
            {new Intl.NumberFormat(i18n.language, {
              style: 'percent',
              maximumFractionDigits: 0,
            }).format(ratio)}
          </span>
        </div>
      )}
      <p className="text-sm">
        {total === null
          ? t('updateProgressUnknown', {
              downloaded: formatBytes(downloaded, i18n.language),
            })
          : t('updateProgressKnown', {
              downloaded: formatBytes(downloaded, i18n.language),
              total: formatBytes(total, i18n.language),
            })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={paused ? 'success' : 'warning'}
          size="sm"
          onClick={() => onAction(paused ? 'resume' : 'pause')}
        >
          {paused ? t('updateResume') : t('updatePause')}
        </Button>
        {/* Neutral rather than the scan's error red: cancelling a download
            throws away a transfer, not anything the user has to be warned
            about, and the bytes can be fetched again. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAction('cancel')}
        >
          {t('updateCancel')}
        </Button>
      </div>
    </div>
  );
}
