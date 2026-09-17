import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { Toast } from '../../shared/Toast';
import { useLibraryContext } from '../library/LibraryProvider';
import { isScanRunning } from '../library/scanFeedback';
import { UpdatePrompt } from './UpdatePrompt';
import { useUpdate } from './useUpdate';
import type { UpdateState } from './useUpdate';

const UpdateContext = createContext<UpdateState | null>(null);

export function useUpdateContext() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('useUpdateContext requires an UpdateProvider');
  return value;
}

/**
 * Runs the startup check and owns everything the update flow shows on its own:
 * the offer to download, the notice that a restart is pending, and any failure.
 *
 * These live here rather than on the settings page because the check runs at
 * launch, when the user is on whichever page they left off on — an offer that
 * only appeared once they opened settings would not be an offer.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const update = useUpdate();
  const library = useLibraryContext();
  const { t } = useTranslation();
  const { startupCheck, check, downloading, restarting, error } = update;
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [dismissedReady, setDismissedReady] = useState<string | null>(null);

  useEffect(() => {
    startupCheck();
  }, [startupCheck]);

  const scanning = isScanRunning(library.scan.data);
  const available = check?.available ?? null;
  const readyVersion = check?.readyToRestart
    ? (available?.version ?? '')
    : null;
  // Declining an offer is remembered for this session: asking again on every
  // page change would be nagging, and the settings section keeps the offer
  // visible with a way to act on it.
  const showPrompt =
    available !== null &&
    !check?.readyToRestart &&
    !downloading &&
    !scanning &&
    available.version !== dismissedVersion;
  const showReady =
    readyVersion !== null && readyVersion !== dismissedReady && !downloading;

  return (
    <UpdateContext.Provider value={update}>
      {children}
      {/* A scan holds the same slot the installer would interrupt, so the offer
          waits rather than stacking a second dialog on the scan's. */}
      {showPrompt && available && (
        <UpdatePrompt
          available={available}
          busy={downloading}
          onDownload={update.install}
          onClose={() => setDismissedVersion(available.version)}
        />
      )}
      {showReady && readyVersion !== null && (
        <Toast
          type="success"
          closeLabel={t('close')}
          onClose={() => setDismissedReady(readyVersion)}
        >
          <h3 className="font-bold">{t('updateReadyTitle')}</h3>
          <p className="text-sm break-words">
            {t('updateReady', { version: readyVersion })}
          </p>
          <button
            className="btn btn-outline btn-sm btn-primary mt-2"
            disabled={scanning || restarting}
            onClick={update.restart}
          >
            {restarting ? t('updateRestarting') : t('updateRestart')}
          </button>
          {scanning && (
            <p className="text-sm opacity-65">{t('updateRestartBlocked')}</p>
          )}
        </Toast>
      )}
      {/* Failures float over whatever page the user is on: the download can be
          started from a dialog raised on the library page, so an error confined
          to the settings section could go unseen. */}
      {error && <ErrorNotice error={error} onClose={update.dismissError} />}
    </UpdateContext.Provider>
  );
}
