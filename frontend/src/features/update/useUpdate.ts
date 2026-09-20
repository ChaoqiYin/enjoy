import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { libraryApi, normalizeError } from '../../shared/api';
import type { AppError, UpdateCheck, UpdateProgress } from '../../shared/api';

/**
 * What a finished check has to say when there is nothing to act on. Shown as a
 * floating notice rather than written into the settings section, which holds
 * the offer itself: a release to download or restart into is content the
 * section renders, while these two are answers to having asked.
 */
export type CheckNotice = 'upToDate' | 'unsupported';

export function useUpdate() {
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState<CheckNotice | null>(null);

  useEffect(() => {
    let disposed = false;
    const unlisten: UnlistenFn[] = [];
    const subscription = listen<UpdateProgress>(
      'update-progress',
      ({ payload }) => {
        if (disposed) return;
        if (payload.phase !== 'ready') {
          setDownloading(true);
          setProgress(payload);
          return;
        }
        // The bytes are verified and held by the backend; only a restart is
        // missing, so the section switches to offering one.
        setDownloading(false);
        setProgress(null);
        setCheck((current) =>
          current ? { ...current, readyToRestart: true } : current,
        );
      },
    );
    void subscription
      .then((stop) => {
        if (disposed) stop();
        else unlisten.push(stop);
      })
      .catch(() => {
        // A missing event channel costs the progress bar, not the update: the
        // command still answers and the section still offers the restart.
      });
    return () => {
      disposed = true;
      for (const stop of unlisten) stop();
    };
  }, []);

  /**
   * The only check is the one the user asked for by pressing the button, so a
   * failure is always reported: they are owed an answer for the press.
   */
  const checkNow = useCallback(() => {
    setChecking(true);
    setError(null);
    void libraryApi
      .checkForUpdate()
      .then((result) => {
        setCheck(result);
        // A release to act on speaks for itself in the section; the two
        // answers that leave nothing to press are what the notice is for.
        if (!result.supported) setNotice('unsupported');
        else if (!result.available) setNotice('upToDate');
        else setNotice(null);
      })
      .catch((cause) => setError(normalizeError(cause)))
      .finally(() => setChecking(false));
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissError = useCallback(() => setError(null), []);

  const install = useCallback(() => {
    setError(null);
    setDownloading(true);
    setProgress(null);
    void libraryApi.installUpdate().catch((cause) => {
      setDownloading(false);
      setProgress(null);
      setError(normalizeError(cause));
    });
  }, []);

  const restart = useCallback(() => {
    setRestarting(true);
    void libraryApi.restartApp().catch((cause) => {
      // Installing exits this process before the command can answer, so the
      // promise rejects even on a restart that works — and by then there is no
      // window left to react. A rejection that does reach us therefore means
      // the app is still here and the restart did not happen, so the state is
      // restored and the reason shown rather than left on "restarting".
      setRestarting(false);
      setError(normalizeError(cause));
    });
  }, []);

  return {
    check,
    checking,
    downloading,
    progress,
    restarting,
    error,
    notice,
    checkNow,
    install,
    restart,
    dismissNotice,
    dismissError,
  };
}

export type UpdateState = ReturnType<typeof useUpdate>;
