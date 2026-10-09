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
        {/* The record carries the 共享清单 mark, so removing it takes the video
            off that list as well. Said only when it is true: a warning on every
            removal is one the user learns to read past, and this one is the
            answer to "why did the television stop seeing it". */}
        {video.shared && <p>{t('removeShared')}</p>}
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
