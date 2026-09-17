import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { libraryApi, normalizeError } from '../../shared/api';
import type { AppError, ScanStatus } from '../../shared/api';
import { shouldAnnounceScan } from './scanFeedback';

export function useLibrary() {
  const client = useQueryClient();
  const [failure, setFailure] = useState<{
    error: AppError;
    retry?: () => Promise<unknown>;
  } | null>(null);
  function setError(error: AppError | null, retry?: () => Promise<unknown>) {
    setFailure(error ? { error, retry } : null);
  }
  const [completion, setCompletion] = useState<ScanStatus | null>(null);
  // A short hint is not a notice and does not take the notice slot: it is a
  // different kind of thing, telling the user an action landed rather than
  // something to read and act on. See the development guide.
  const [copyHint, setCopyHint] = useState(false);
  // Which card carries the "last played" marker. It is the video the user just
  // handed to the system player, held for as long as the app runs and no
  // longer: the index already keeps the history across runs (`last_played_at`,
  // which the history page sorts on), while this marker answers "which one did
  // I play a moment ago", so it belongs to the session. Held here rather than
  // in a page because all three pages render the same card and share this
  // provider, so the marker follows the user across them.
  const [lastPlayedId, setLastPlayedId] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
  const [dismissedQueryErrors, setDismissedQueryErrors] = useState<unknown[]>(
    [],
  );
  const videos = useQuery({
    queryKey: ['videos'],
    queryFn: libraryApi.list,
    retry: false,
  });
  const directories = useQuery({
    queryKey: ['directories'],
    queryFn: libraryApi.directories,
    retry: false,
  });
  const scan = useQuery({
    queryKey: ['scan'],
    queryFn: libraryApi.scanStatus,
    refetchInterval: 700,
    retry: false,
  });
  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unlisten: UnlistenFn[] = [];
    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void client.invalidateQueries({ queryKey: ['videos'] });
        void client.invalidateQueries({ queryKey: ['directories'] });
      }, 200);
    };
    const subscriptions = [
      listen('library-changed', () => {
        if (!disposed) refresh();
      }),
      listen<ScanStatus>('scan-progress', ({ payload }) => {
        if (disposed) return;
        client.setQueryData(['scan'], payload);
        if (shouldAnnounceScan(payload)) setCompletion(payload);
        refresh();
      }),
      listen<AppError>('media-error', ({ payload }) => {
        if (!disposed) setError(normalizeError(payload));
      }),
    ];
    for (const subscription of subscriptions) {
      void subscription
        .then((stop) => {
          if (disposed) stop();
          else unlisten.push(stop);
        })
        .catch((cause) => {
          if (!disposed) setError(normalizeError(cause));
        });
    }
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const stop of unlisten) stop();
    };
  }, [client]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    // A new action makes the previous completion notice stale: without this it
    // stays on screen showing counts from the scan that already finished, and
    // is only replaced once the new scan completes with something to announce.
    setCompletion(null);
    setPending((count) => count + 1);
    try {
      await action();
    } catch (cause) {
      const failure = normalizeError(cause);
      if (failure.code !== 'media.scan.cancelled') setError(failure, action);
    } finally {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['videos'] }),
        client.invalidateQueries({ queryKey: ['directories'] }),
        client.invalidateQueries({ queryKey: ['scan'] }),
      ]);
      setPending((count) => count - 1);
    }
  }

  async function controlScan(action: 'pause' | 'resume' | 'cancel') {
    try {
      await libraryApi.controlScan(action);
      await client.invalidateQueries({ queryKey: ['scan'] });
    } catch (cause) {
      setError(normalizeError(cause), () => libraryApi.controlScan(action));
    }
  }
  const failedQuery = [videos, directories, scan].find(
    (query) => query.error && !dismissedQueryErrors.includes(query.error),
  );
  const retryError = failure
    ? failure.retry
      ? () => run(failure.retry!)
      : undefined
    : failedQuery
      ? () => run(() => failedQuery.refetch({ throwOnError: true }))
      : undefined;
  return {
    videos,
    completion,
    dismissCompletion: () => setCompletion(null),
    copyHint,
    showCopyHint: () => setCopyHint(true),
    dismissCopyHint: () => setCopyHint(false),
    lastPlayedId,
    markPlayed: (id: number) => setLastPlayedId(id),
    directories,
    scan,
    busy,
    error:
      failure?.error ??
      (failedQuery ? normalizeError(failedQuery.error) : null),
    retryError: busy ? undefined : retryError,
    setError: (value: AppError | null) => {
      setError(value);
      if (value === null)
        setDismissedQueryErrors([videos.error, directories.error, scan.error]);
    },
    run,
    controlScan,
  };
}
