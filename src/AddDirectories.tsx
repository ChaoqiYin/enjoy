import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { normalizeError } from './api';
import type { AppError } from './api';

interface Props {
  onClose: () => void;
  onScan: (paths: string[]) => void;
  onError: (error: AppError) => void;
}

export function AddDirectories({ onClose, onScan, onError }: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function choose() {
    setChoosing(true);
    try {
      const selected = await open({ directory: true, multiple: true });
      if (selected)
        setPaths((current) => [...new Set([...current, ...selected])]);
    } catch (error) {
      onError(normalizeError(error));
    } finally {
      setChoosing(false);
    }
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
                <button
                  className="btn btn-sm"
                  aria-label={t('removePath', { path })}
                  onClick={() =>
                    setPaths((current) =>
                      current.filter((value) => value !== path),
                    )
                  }
                >
                  {t('remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn" disabled={choosing} onClick={choose}>
          {t('chooseFolder')}
        </button>
        <div className="modal-action">
          <form method="dialog">
            <button className="btn">{t('cancel')}</button>
          </form>
          <button
            className="btn"
            disabled={choosing || paths.length === 0}
            onClick={() => onScan(paths)}
          >
            {t('startScan')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
