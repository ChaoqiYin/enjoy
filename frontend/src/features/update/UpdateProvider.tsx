import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { Toast } from '../../shared/Toast';
import { useLibraryContext } from '../library/LibraryProvider';
import { isScanRunning } from '../library/scanFeedback';
import { useUpdate } from './useUpdate';
import type { UpdateState } from './useUpdate';

/**
 * How long a check's answer stays. Neither notice asks the user for anything —
 * one confirms the latest version, the other explains why nothing can be
 * checked here — so both close themselves, the rule the scan's clean
 * completion already follows. The stay is longer than that one's because the
 * unsupported notice is a sentence to read rather than a status to recognise.
 */
const CHECK_NOTICE_MS = 5000;

const UpdateContext = createContext<UpdateState | null>(null);

export function useUpdateContext() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('useUpdateContext requires an UpdateProvider');
  return value;
}

/**
 * Holds the update state above the settings page and shows what the flow has
 * to say on its own: the notice that a restart is pending, and any failure.
 *
 * No check runs here. Checking is something only the button in the settings
 * section does, so `check` stays null until the user presses it; the state
 * still lives above that page because a download started there has to survive
 * leaving it.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const update = useUpdate();
  const library = useLibraryContext();
  const { t } = useTranslation();
  const { check, downloading, restarting, error, notice } = update;
  const [dismissedReady, setDismissedReady] = useState<string | null>(null);

  const scanning = isScanRunning(library.scan.data);
  const available = check?.available ?? null;
  const readyVersion = check?.readyToRestart
    ? (available?.version ?? '')
    : null;
  const showReady =
    readyVersion !== null && readyVersion !== dismissedReady && !downloading;

  return (
    <UpdateContext.Provider value={update}>
      {children}
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
      {/* The answer to a check that leaves nothing to act on. Shown as a
          notice rather than written into the settings section, which keeps one
          shape — the version line, the button, and whatever there is to
          download — instead of changing its wording per outcome. */}
      {notice && (
        <Toast
          type={notice === 'unsupported' ? 'info' : 'success'}
          closeLabel={t('close')}
          autoCloseMs={CHECK_NOTICE_MS}
          onClose={update.dismissNotice}
        >
          <p className="text-sm break-words">
            {notice === 'unsupported'
              ? t('updateUnsupported')
              : t('updateUpToDate')}
          </p>
        </Toast>
      )}
      {/* Failures float over whatever page the user is on: a download started
          in the settings section keeps running after they leave it, so an
          error confined to that section could go unseen. */}
      {error && <ErrorNotice error={error} onClose={update.dismissError} />}
    </UpdateContext.Provider>
  );
}
