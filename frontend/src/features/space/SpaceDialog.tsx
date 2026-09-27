import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../shared/errorMessage';
import { useCommand } from '../../shared/useCommand';

/**
 * Names a space, for both creating one and renaming one, so that the two paths
 * cannot grow different rules or say different things about them.
 *
 * A refused name is reported beside the field rather than in the notice at the
 * corner of the screen: the answer belongs where the name was typed, and the
 * dialog stays open with the text still in it, so a fix costs a keystroke
 * instead of starting over. The rules themselves are the backend's — it is the
 * one that keeps the names, and the only one that can see all of them — so this
 * asks and waits rather than guessing first.
 */
export function SpaceDialog({
  title,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const translator = useTranslation();
  const { t } = translator;
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initialName);
  const { busy, failure, run } = useCommand();
  useEffect(() => dialog.current?.showModal(), []);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    // Closing is inside the action, and the failure is left here rather than
    // sent to the corner of the screen: it is about the name that was typed,
    // and the field it belongs beside is still open.
    return run(undefined, async () => {
      await onSubmit(name);
      onClose();
    });
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="space-dialog-title"
      // Escape closes a modal on its own; this is what brings the interface
      // back in step with it.
      onClose={onClose}
    >
      <form className="modal-box space-y-4" onSubmit={submit}>
        <h2 id="space-dialog-title" className="text-2xl font-bold">
          {title}
        </h2>
        <label className="block space-y-2">
          <span>{t('spaceName')}</span>
          <input
            className="input w-full"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        {failure && (
          <p className="text-error" role="alert">
            {errorMessage(translator, failure.error)}
          </p>
        )}
        <div className="modal-action items-center gap-3">
          <button
            type="button"
            className="btn btn-soft btn-md btn-neutral"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-soft btn-md btn-primary"
            disabled={busy}
          >
            {t('confirm')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
