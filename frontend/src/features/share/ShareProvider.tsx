import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { backendEvents, windowApi } from '../../shared/api';
import type { AppError } from '../../shared/api';
import { useCommand } from '../../shared/useCommand';
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
 * wrong on its own, and puts the question the backend asks when a close arrives
 * while the service is running.
 *
 * Above the page because the service outlives a visit to it: a user who starts
 * sharing and walks back to the library is still sharing, and the indicator on
 * the navigation entry — which every page can see — is reading this.
 *
 * The question belongs here rather than on the sharing page for that same
 * reason: the window can be closed from any page, and the service is the whole
 * application's. What the user is told is what closing would cost them — a
 * device may be in the middle of a film — and the answer is theirs to give.
 *
 * What is *not* here is the decision to ask at all. Whether a close is held is
 * the backend's (`crate::closing`): it is the one that knows a service is
 * running, and a window whose close is decided on this side is a window this
 * side has to be able to close — which is where two releases in a row went
 * wrong. This side is told when there is a question, and answers it.
 *
 * Failures float rather than sitting in the page for the same reason the
 * update's do: the control that caused one may already be off screen, and a
 * service the user believes is running when it is not is the one thing this
 * surface must not leave unsaid.
 */
export function ShareProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const share = useShare();
  // Whether the backend is holding a close and waiting for an answer.
  const [asking, setAsking] = useState(false);
  // The close's own failure, which is not the sharing state's: closing the window
  // is not a command of the service's. It is kept so that a window that would not
  // close is said out loud rather than left as a button that does nothing.
  const [refused, setRefused] = useState<AppError | null>(null);
  const closing = useCommand(setRefused);
  // Read through a ref rather than closed over: the subscription is made once
  // for the life of the interface, and what it reads is whether an answer is
  // already being carried out at the moment the question arrives.
  const answering = useLatestRef(closing.busy);
  useEffect(() => {
    // Subscribed for the life of the interface, unlike the close itself: this is
    // a message from the backend rather than a hold on the window, so a listener
    // that outlives a service costs nothing and takes nothing away — Tauri's
    // close-requested hold, which is what used to make an extra listener
    // dangerous, is not involved in this path at all.
    let stop: (() => void) | undefined;
    let live = true;
    void backendEvents
      .onCloseRequested(() => {
        // A question arriving while the answer is being carried out is the same
        // question: the window is already on its way out, and the service is
        // being ended on the way. Reopening it would put a second dialog in
        // front of a close that is already happening.
        if (!answering.current) setAsking(true);
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
  }, [answering]);
  const notice = refused ?? share.error;
  return (
    <ShareContext.Provider value={share}>
      {children}
      {asking && (
        <ConfirmDialog
          message={t('shareCloseQuestion')}
          confirmLabel={t('shareCloseConfirm')}
          cancelLabel={t('cancel')}
          onCancel={() => setAsking(false)}
          // Answered by the backend, which ends the service and then closes the
          // window: one command, because the two are one answer. Whether it
          // worked is not read here — the window that would show the failure is
          // the one being closed — so the question is closed out either way.
          onConfirm={() => {
            setAsking(false);
            void closing.run(undefined, () => windowApi.close());
          }}
        />
      )}
      {/* The close's failure, and the service's, are shown in the one place:
          both are things the user asked for and did not get. The close's is the
          one that is never retried by a button here — the thing to press again
          is the window's own close button. */}
      {notice && (
        <ErrorNotice
          error={notice}
          // Offered only while there is something to retry: the failure worth
          // repeating is a start that did not take, and a running service has
          // nothing to try again.
          onRetry={!refused && share.port === null ? share.start : undefined}
          onClose={refused ? () => setRefused(null) : share.dismissError}
        />
      )}
    </ShareContext.Provider>
  );
}
