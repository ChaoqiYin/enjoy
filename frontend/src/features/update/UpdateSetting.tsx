import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import packageInfo from '../../../../package.json';
import type { UpdateProgress } from '../../shared/api';
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
            {check && !check.supported ? ` · ${t('updateUnsupported')}` : ''}
          </p>
        </div>
        {check?.supported && (
          <button
            className="btn btn-primary btn-soft btn-md gap-3"
            disabled={busy}
            onClick={update.checkNow}
          >
            <RefreshCw size={18} aria-hidden="true" />
            {update.checking ? t('updateChecking') : t('updateCheck')}
          </button>
        )}
      </div>

      {update.downloading && <UpdateProgressBlock progress={update.progress} />}

      {ready && available && !update.downloading && (
        <div className="space-y-3">
          <p className="text-sm">
            {t('updateReady', { version: available.version })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn btn-primary btn-soft btn-md gap-3"
              disabled={scanning || update.restarting}
              onClick={update.restart}
            >
              <RotateCw size={18} aria-hidden="true" />
              {update.restarting ? t('updateRestarting') : t('updateRestart')}
            </button>
            {scanning && (
              <p className="text-sm opacity-65">{t('updateRestartBlocked')}</p>
            )}
          </div>
        </div>
      )}

      {available && !ready && !update.downloading && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {t('updateAvailable', { version: available.version })}
          </p>
          <button
            className="btn btn-primary btn-soft btn-md gap-3"
            onClick={update.install}
          >
            <Download size={18} aria-hidden="true" />
            {t('updateDownload')}
          </button>
        </div>
      )}

      {check?.supported && !available && !update.downloading && (
        <p className="text-sm">{t('updateUpToDate')}</p>
      )}
    </section>
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
