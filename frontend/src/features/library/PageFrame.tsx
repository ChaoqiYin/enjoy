import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { ScanProgress } from './ScanProgress';
import { useLibraryContext } from './LibraryProvider';
export function PageFrame({ children }: { children: ReactNode }) {
  const library = useLibraryContext();
  const { t, i18n } = useTranslation();
  const status = library.scan.data;
  const scanning =
    status && ['discovering', 'processing', 'paused'].includes(status.phase);
  return (
    <main className="w-full max-w-7xl mx-auto p-6 min-h-0 flex-1 flex flex-col gap-6 overflow-hidden">
      {library.error && (
        <ErrorNotice
          error={library.error}
          onRetry={library.retryError}
          onClose={() => library.setError(null)}
        />
      )}
      {library.completion && (
        <section
          role="status"
          className="rounded-box bg-base-200 p-4 space-y-2"
        >
          <h2>{t('scanComplete')}</h2>
          <p>
            {t('scanChanges', {
              added: library.completion.changes.added.toLocaleString(
                i18n.language,
              ),
              updated: library.completion.changes.updated.toLocaleString(
                i18n.language,
              ),
              missing: library.completion.changes.unavailable.toLocaleString(
                i18n.language,
              ),
            })}
          </p>
          {library.completion.failures > 0 && (
            <p>
              {t('scanFailures', {
                countText: library.completion.failures.toLocaleString(
                  i18n.language,
                ),
              })}
            </p>
          )}
          <button
            className="btn btn-outline btn-sm btn-neutral"
            onClick={library.dismissCompletion}
          >
            {t('close')}
          </button>
        </section>
      )}
      {scanning && (
        <ScanProgress status={status} onAction={library.controlScan} />
      )}
      {children}
    </main>
  );
}
