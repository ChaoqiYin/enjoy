import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import packageInfo from '../../../../package.json';
import type { AvailableUpdate, UpdateProgress } from '../../shared/api';
import { useLibraryContext } from '../library/LibraryProvider';
import { isScanRunning } from '../library/scanFeedback';
import { useUpdateContext } from './UpdateProvider';
import { formatBytes, progressRatio } from './updateFormat';

export function UpdateSetting() {
  const { t } = useTranslation();
  const update = useUpdateContext();
  const library = useLibraryContext();
  const check = update.check;
  const available = check?.available ?? null;
  const ready = check?.readyToRestart ?? false;
  const busy = update.checking || update.downloading;
  // Installing exits the process, so a pass in flight would be lost. The
  // backend refuses this outright; disabling here is only so the user is not
  // invited to press a button that cannot work.
  const scanning = isScanRunning(library.scan.data);
  return (
    <section className="border-b border-base-300 pb-5 space-y-3">
      <div className="flex w-full items-center justify-between gap-8 max-md:flex-col max-md:items-start">
        <div>
          <h3 className="font-medium">{t('updateTitle')}</h3>
          <p className="text-sm opacity-65">
            {t('updateCurrent', {
              // The backend compares the version it is built with; the bundled
              // one only stands in until the first check answers.
              version: check?.currentVersion ?? packageInfo.version,
            })}
          </p>
        </div>
        {/* Always offered. Only this button starts a check, so whether the
            platform has published updates is unknown until it is pressed, and
            an answer of "none" arrives as a notice rather than by taking away
            the button the user just pressed. */}
        <button
          className="btn btn-primary btn-soft btn-md gap-3"
          disabled={busy}
          onClick={update.checkNow}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {update.checking ? t('updateChecking') : t('updateCheck')}
        </button>
      </div>

      {update.downloading && <UpdateProgressBlock progress={update.progress} />}

      {available && !update.downloading && (
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
              <button
                className="btn btn-primary btn-soft btn-md gap-3"
                disabled={scanning || update.restarting}
                onClick={update.restart}
              >
                <RotateCw size={18} aria-hidden="true" />
                {update.restarting ? t('updateRestarting') : t('updateRestart')}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-soft btn-md gap-3"
                onClick={update.install}
              >
                <Download size={18} aria-hidden="true" />
                {t('updateDownload')}
              </button>
            )}
            {ready && scanning && (
              <p className="text-sm opacity-65">{t('updateRestartBlocked')}</p>
            )}
          </div>
          <ReleaseNotes available={available} />
        </div>
      )}
    </section>
  );
}

/**
 * What the check said the release contains, shown in the section rather than in
 * a dialog: it is what the decision to download rests on, so it belongs next to
 * the button that makes that decision.
 */
function ReleaseNotes({ available }: { available: AvailableUpdate }) {
  const { t, i18n } = useTranslation();
  if (!available.date && !available.notes) return null;
  return (
    <div className="space-y-2">
      {available.date && (
        <p className="text-sm opacity-65">
          {t('updateReleasedAt', {
            date: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'medium',
            }).format(new Date(available.date)),
          })}
        </p>
      )}
      {available.notes && (
        <>
          <h4 className="font-medium">{t('updateNotes')}</h4>
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
}: {
  progress: UpdateProgress | null;
}) {
  const { t, i18n } = useTranslation();
  const downloaded = progress?.downloaded ?? 0;
  const total = progress?.total ?? null;
  const ratio = progressRatio(downloaded, total);
  const label = t('updateDownloading');
  return (
    <div role="status" className="rounded-box bg-base-200 p-4 space-y-3">
      <p>{label}</p>
      {ratio === null ? (
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
      ) : (
        <div className="flex items-center gap-3">
          <progress
            className="progress flex-1"
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
    </div>
  );
}
