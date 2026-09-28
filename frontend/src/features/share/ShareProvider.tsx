import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { useShare } from './useShare';
import type { Share } from './useShare';

const ShareContext = createContext<Share | null>(null);

export function useShareContext(): Share {
  const value = useContext(ShareContext);
  if (!value) throw new Error('useShareContext requires a ShareProvider');
  return value;
}

/**
 * Holds the service's state above the page that starts it, and shows what went
 * wrong on its own.
 *
 * Above the page because the service outlives a visit to it: a user who starts
 * sharing and walks back to the library is still sharing, and the indicator on
 * the navigation entry — which every page can see — is reading this.
 *
 * Failures float rather than sitting in the page for the same reason the
 * update's do: the control that caused one may already be off screen, and a
 * service the user believes is running when it is not is the one thing this
 * surface must not leave unsaid.
 */
export function ShareProvider({ children }: { children: ReactNode }) {
  const share = useShare();
  return (
    <ShareContext.Provider value={share}>
      {children}
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
