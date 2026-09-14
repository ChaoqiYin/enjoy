import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';

export function RemoveConfirmation({
  video,
  onCancel,
  onConfirm,
}: {
  video: Video;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="remove-title"
      aria-describedby="remove-description"
      onClose={onCancel}
    >
      <div className="modal-box space-y-4">
        <h2 id="remove-title" className="text-xl break-all">
          {t('removeQuestion', { name: video.file_name })}
        </h2>
        <p id="remove-description">{t('keepFile')}</p>
        <div className="modal-action items-center gap-3">
          <form method="dialog">
            <button autoFocus className="btn btn-soft btn-md btn-neutral">
              {t('cancel')}
            </button>
          </form>
          <button className="btn btn-soft btn-md btn-error" onClick={onConfirm}>
            {t('remove')}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>{t('cancel')}</button>
      </form>
    </dialog>
  );
}
