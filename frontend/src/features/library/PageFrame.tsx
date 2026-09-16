import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { Toast } from '../../shared/Toast';
import { ScanProgress } from './ScanProgress';
import { ThumbnailProgress } from './ThumbnailProgress';
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
        <Toast
          type="success"
          closeLabel={t('close')}
          onClose={library.dismissCompletion}
        >
          <h3 className="font-bold">
            {t(
              library.completion.operation === 'thumbnails'
                ? 'thumbnailComplete'
                : 'scanComplete',
            )}
          </h3>
          <p className="text-sm break-words">
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
            {library.completion.failures > 0
              ? ` ${t('scanFailures', { countText: library.completion.failures.toLocaleString(i18n.language) })}`
              : ''}
          </p>
        </Toast>
      )}
      {scanning && (
        <dialog open className="modal" aria-labelledby="scan-progress-title">
          <div className="modal-box max-w-lg">
            <h2 id="scan-progress-title" className="sr-only">
              {t('scanning')}
            </h2>
            {status.operation === 'thumbnails' ? (
              <ThumbnailProgress
                status={status}
                onAction={(action) => {
                  void library.controlScan(action);
                }}
              />
            ) : (
              <ScanProgress
                status={status}
                onAction={(action) => {
                  void library.controlScan(action);
                }}
              />
            )}
          </div>
        </dialog>
      )}
      {children}
    </main>
  );
}
