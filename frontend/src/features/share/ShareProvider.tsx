import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { windowApi } from '../../shared/api';
import { useLatestRef } from '../../shared/useLatestRef';
import { useShare } from './useShare';
import type { Share } from './useShare';

const ShareContext = createContext<Share | null>(null);

export function useShareContext(): Share {
  const value = useContext(ShareContext);
  if (!value) throw new Error('useShareContext requires a ShareProvider');
  return value;
}

/**
 * Holds the service's state above the page that starts it, shows what went
 * wrong on its own, and holds the window open while a close is being asked
 * about.
 *
 * Above the page because the service outlives a visit to it: a user who starts
 * sharing and walks back to the library is still sharing, and the indicator on
 * the navigation entry — which every page can see — is reading this.
 *
 * The close belongs here rather than on the sharing page for that same reason:
 * the window can be closed from any page, and the service is the whole
 * application's. What the user is told is what closing would cost them — a
 * device may be in the middle of a film — and the answer is theirs to give.
 *
 * Failures float rather than sitting in the page for the same reason the
 * update's do: the control that caused one may already be off screen, and a
 * service the user believes is running when it is not is the one thing this
 * surface must not leave unsaid.
 */
export function ShareProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const share = useShare();
  const [closing, setClosing] = useState(false);
  // Read through a ref rather than closed over: the subscription is made once,
  // and the port it asks about changes every time the service starts or stops.
  const latest = useLatestRef(share);
  // Set when the user has said yes and the close is being carried out. The
  // close that follows arrives here a second time, and this is what lets it
  // through: by then the question has been answered, and asking it again would
  // leave the window open on a service that is already stopped.
  const answered = useRef(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let live = true;
    void windowApi
      .onCloseRequested((event) => {
        // Silence when there is nothing to interrupt: a window that closes
        // without a prompt is what closing a window normally does.
        if (answered.current || latest.current.port === null) return;
        event.preventDefault();
        setClosing(true);
      })
      .then((unlisten) => {
        // The subscription may come back after this effect was torn down, which
        // happens when the interface goes away while the window is being asked.
        if (live) stop = unlisten;
        else unlisten();
      });
    return () => {
      live = false;
      stop?.();
    };
  }, [latest]);
  const close = async () => {
    answered.current = true;
    // The window is closed whatever became of the service: the user asked to
    // leave, and the process going away releases the port in any case — a
    // failure worth reading is shown by the notice below, and holding the
    // window open on it would be worse than the failure.
    await latest.current.stop();
    await windowApi.close();
  };
  return (
    <ShareContext.Provider value={share}>
      {children}
      {closing && (
        <ConfirmDialog
          message={t('shareCloseQuestion')}
          confirmLabel={t('shareCloseConfirm')}
          cancelLabel={t('cancel')}
          onCancel={() => setClosing(false)}
          onConfirm={close}
        />
      )}
      {share.error && (
        <ErrorNotice
          error={share.error}
          // Offered only while there is something to retry: the failure worth
          // repeating is a start that did not take, and a running service has
          // nothing to try again.
          onRetry={share.port === null ? share.start : undefined}
          onClose={share.dismissError}
        />
      )}
    </ShareContext.Provider>
  );
}
