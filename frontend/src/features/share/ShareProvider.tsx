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
  // Read through a ref rather than closed over: the subscription is made once
  // per service, and what it reads is the moment rather than the render.
  const latest = useLatestRef(share);
  // Set when the user has said yes and the close is being carried out. A close
  // arriving after that is held rather than asked about: the window is already
  // on its way out, and re-asking would put a second dialog in front of a
  // service that is being ended.
  const answered = useRef(false);
  // Subscribed while there is something to interrupt, and only then. A window
  // with a close-requested listener never closes by itself — Tauri prevents
  // every close and hands the request to this handler instead — so a
  // subscription that outlived the service would be a window that cannot be
  // closed by its own close button, and nothing running means there is no
  // question worth holding it for. Without a listener the close goes through
  // the window's own path, with no permission and no round trip.
  const asking = share.port !== null;
  useEffect(() => {
    if (!asking) return;
    let stop: (() => void) | undefined;
    let live = true;
    void windowApi
      .onCloseRequested((event) => {
        // Held even when the answer is already on its way: Tauri has prevented
        // this close by the time the event arrives, so letting it through here
        // would destroy the window behind the question. What the answer decides
        // is when the window goes, which is the destroy in `close` below.
        event.preventDefault();
        if (!answered.current) setClosing(true);
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
  }, [asking, latest]);
  const close = async () => {
    // Answered twice is answered once: the second arrival is a second click on
    // a button whose question is already being carried out.
    if (answered.current) return;
    answered.current = true;
    // The window is closed whatever became of the service: the user asked to
    // leave, and the process going away releases the port in any case — a
    // failure worth reading is shown by the notice below, and holding the
    // window open on it would be worse than the failure. `stop` answers whether
    // it worked rather than throwing, so the `finally` is what keeps the window
    // from depending on that staying true.
    try {
      await latest.current.stop();
    } finally {
      await windowApi.close();
    }
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
