import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { libraryApi, normalizeError } from '../../shared/api';
import type { AppError, UpdateCheck, UpdateProgress } from '../../shared/api';

export function useUpdate() {
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

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
   * `report` separates the two callers. The startup check stays silent — an
   * offline machine or a blocked endpoint should not raise a notice on every
   * launch — while a check the user asked for says what went wrong.
   */
  const runCheck = useCallback(async (report: boolean) => {
    setChecking(true);
    if (report) setError(null);
    try {
      setCheck(await libraryApi.checkForUpdate());
    } catch (cause) {
      if (report) setError(normalizeError(cause));
    } finally {
      setChecking(false);
    }
  }, []);

  const startupCheck = useCallback(() => void runCheck(false), [runCheck]);
  const checkNow = useCallback(() => void runCheck(true), [runCheck]);
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
    startupCheck,
    checkNow,
    install,
    restart,
    dismissError,
  };
}

export type UpdateState = ReturnType<typeof useUpdate>;
