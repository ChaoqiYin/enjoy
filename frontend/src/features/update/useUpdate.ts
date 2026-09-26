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
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState<CheckNotice | null>(null);

  useEffect(() => {
    let disposed = false;
    const unlisten: UnlistenFn[] = [];
    // Progress only. How the transfer ended comes back as the answer to
    // `installUpdate`, so the section never has to decide whether an event or
    // an answer was the last word on it.
    const subscription = listen<UpdateProgress>(
      'update-progress',
      ({ payload }) => {
        if (disposed) return;
        setProgress(payload);
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

  /**
   * Starts a download, and is also what continues a paused one: the bytes it
   * kept are on the backend, so a second call asks for the rest rather than
   * fetching the release over.
   */
  const install = useCallback(() => {
    setError(null);
    setDownloading(true);
    setPaused(false);
    setProgress(null);
    void libraryApi
      .installUpdate()
      .then((ended) => {
        // The transfer is over, whatever the progress events last said, and
        // this answer says which way.
        setDownloading(false);
        if (ended.phase === 'paused') {
          // The numbers stay on screen: a paused download is one the user is
          // coming back to, and how far it got is what they come back to see.
          setPaused(true);
          setProgress(ended);
          return;
        }
        setPaused(false);
        setProgress(null);
        if (ended.phase === 'ready') {
          setCheck((current) =>
            current ? { ...current, readyToRestart: true } : current,
          );
        }
      })
      .catch((cause) => {
        setDownloading(false);
        setPaused(false);
        setProgress(null);
        setError(normalizeError(cause));
      });
  }, []);

  /** Asks the running download to stop, keeping what it has for continuing. */
  const pause = useCallback(() => {
    void libraryApi
      .controlUpdate('pause')
      .catch((cause) => setError(normalizeError(cause)));
  }, []);

  /**
   * Throws the download away. While one is running the section is left as it
   * is: the transfer's own answer is what says it ended, and moving on before
   * then would offer a download button while the last one is still unwinding.
   * A paused download has no transfer left to answer, so dismissing it here is
   * the whole of it.
   */
  const cancel = useCallback(() => {
    if (paused) {
      setPaused(false);
      setProgress(null);
    }
    void libraryApi
      .controlUpdate('cancel')
      .catch((cause) => setError(normalizeError(cause)));
  }, [paused]);

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
    paused,
    progress,
    restarting,
    error,
    notice,
    checkNow,
    install,
    pause,
    cancel,
    restart,
    dismissNotice,
    dismissError,
  };
}

export type UpdateState = ReturnType<typeof useUpdate>;
