import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import type { AvailableUpdate } from '../../shared/api';

/**
 * Asks before downloading.
 *
 * A dialog rather than the inline confirm popover the directory rows use: this
 * one is raised by the startup check, so there is no trigger element on the
 * page to anchor to, and the release notes need room that a popover does not
 * have.
 */
export function UpdatePrompt({
  available,
  busy,
  onDownload,
  onClose,
}: {
  available: AvailableUpdate;
  busy: boolean;
  onDownload: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <dialog open className="modal" aria-labelledby="update-prompt-title">
      <div className="modal-box max-w-lg space-y-4">
        <h2 id="update-prompt-title" className="text-xl font-bold">
          {t('updateAvailable', { version: available.version })}
        </h2>
        {available.date && (
          <p className="text-sm opacity-65">
            {t('updateReleasedAt', {
              date: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
              }).format(new Date(available.date)),
            })}
          </p>
        )}
        {available.notes && (
          <>
            <h3 className="font-medium">{t('updateNotes')}</h3>
            {/* Release notes come from our own release manifest, but they are
                still text fetched over the network: rendered as plain text,
                never as markup. */}
            <p className="max-h-48 overflow-y-auto text-sm break-words whitespace-pre-wrap">
              {available.notes}
            </p>
          </>
        )}
        <div className="modal-action">
          <button className="btn btn-soft btn-md btn-neutral" onClick={onClose}>
            {t('updateLater')}
          </button>
          <button
            className="btn btn-primary btn-soft btn-md gap-3"
            disabled={busy}
            onClick={onDownload}
          >
            <Download size={18} aria-hidden="true" />
            {t('updateDownload')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
