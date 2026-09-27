import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ErrorNotice } from '../../shared/ErrorNotice';
import { Toast } from '../../shared/Toast';
import { ScanProgress } from './ScanProgress';
import { completionAutoCloseMs } from './scanFeedback';
import { ThumbnailProgress } from './ThumbnailProgress';
import { Hint } from '../../shared/Hint';
import { useNotices } from './useNotices';
import { useScan } from './useScan';
export function PageFrame({ children }: { children: ReactNode }) {
  const notices = useNotices();
  const { status, isRunning, controlScan } = useScan();
  const { t, i18n } = useTranslation();
  return (
    <main className="w-full max-w-7xl mx-auto p-6 min-h-0 flex-1 flex flex-col gap-6 overflow-hidden">
      {notices.error && (
        <ErrorNotice
          error={notices.error}
          onRetry={notices.retryError}
          onClose={() => notices.setError(null)}
        />
      )}
      {notices.completion && (
        <Toast
          type="success"
          closeLabel={t('close')}
          onClose={notices.dismissCompletion}
          autoCloseMs={completionAutoCloseMs(notices.completion)}
        >
          <h3 className="font-bold">
            {t(
              notices.completion.operation === 'thumbnails'
                ? 'thumbnailComplete'
                : 'scanComplete',
            )}
          </h3>
          <p className="text-sm break-words">
            {t('scanChanges', {
              added: notices.completion.changes.added.toLocaleString(
                i18n.language,
              ),
              updated: notices.completion.changes.updated.toLocaleString(
                i18n.language,
              ),
              removed: notices.completion.changes.removed.toLocaleString(
                i18n.language,
              ),
            })}
            {notices.completion.failures > 0
              ? ` ${t('scanFailures', { countText: notices.completion.failures.toLocaleString(i18n.language) })}`
              : ''}
            {notices.completion.unreachableDirectories > 0
              ? ` ${t('scanUnreachable', { countText: notices.completion.unreachableDirectories.toLocaleString(i18n.language) })}`
              : ''}
          </p>
        </Toast>
      )}
      {notices.copyHint && (
        <Hint text={t('copied')} onClose={notices.dismissCopyHint} />
      )}
      {isRunning && status && (
        <dialog open className="modal" aria-labelledby="scan-progress-title">
          <div className="modal-box max-w-lg">
            <h2 id="scan-progress-title" className="sr-only">
              {t('scanning')}
            </h2>
            {status.operation === 'thumbnails' ? (
              <ThumbnailProgress
                status={status}
                onAction={(action) => {
                  void controlScan(action);
                }}
              />
            ) : (
              <ScanProgress
                status={status}
                onAction={(action) => {
                  void controlScan(action);
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
