import { FolderPlus, Trash2 } from 'lucide-react';
import { Tooltip } from '../../shared/Tooltip';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useCommand } from '../../shared/useCommand';
import { pickDirectories } from '../../shared/api';
import type { AppError } from '../../shared/api';

interface Props {
  onClose: () => void;
  onConfirm: (paths: string[]) => void;
  onError: (error: AppError) => void;
}

export function AddDirectories({ onClose, onConfirm, onError }: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  // A picker that would not open is not about the folders already chosen, so
  // the failure goes to the notice the caller keeps rather than beside this
  // list.
  const { busy: choosing, run } = useCommand(onError);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function choose() {
    return run(undefined, async () => {
      const selected = await pickDirectories();
      if (selected)
        setPaths((current) => [...new Set([...current, ...selected])]);
    });
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="add-directories-title"
      onClose={onClose}
    >
      <div className="modal-box space-y-4">
        <h2 id="add-directories-title" className="text-2xl font-bold">
          {t('addVideos')}
        </h2>
        <p>{t('chooseHelp')}</p>
        {paths.length === 0 ? (
          <p className="opacity-60">{t('noFolders')}</p>
        ) : (
          <ul className="space-y-2">
            {paths.map((path) => (
              <li
                key={path}
                className="flex items-center gap-3 bg-base-200 p-3 rounded-box"
              >
                <span className="break-all flex-1">{path}</span>
                <Tooltip text={t('removePath', { path })}>
                  <button
                    className="btn btn-outline btn-xs btn-square btn-error"
                    aria-label={t('removePath', { path })}
                    onClick={() =>
                      setPaths((current) =>
                        current.filter((value) => value !== path),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn btn-soft btn-md btn-primary"
          disabled={choosing}
          onClick={choose}
        >
          <FolderPlus size={18} aria-hidden="true" />
          {t('chooseFolder')}
        </button>
        <div className="modal-action items-center gap-3">
          <form method="dialog">
            <button className="btn btn-soft btn-md btn-neutral">
              {t('cancel')}
            </button>
          </form>
          <button
            className="btn btn-soft btn-md btn-primary"
            disabled={choosing || paths.length === 0}
            onClick={() => onConfirm(paths)}
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
