import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { backendEvents, libraryApi, normalizeError } from '../../shared/api';
import type { AppError, ScanStatus } from '../../shared/api';
import { useLatestRef } from '../../shared/useLatestRef';
import { shouldAnnounceScan } from './scanFeedback';

/**
 * What the backend is doing to the library, and how the interface hears about
 * it: the scan's status, the commands that steer it, and the three events the
 * application sends.
 *
 * The events are subscribed to **once**, here, on behalf of everything that
 * wants them — that is the rule the development guide states, and it is why
 * this is a module rather than three subscriptions beside their readers. Each
 * subscription is told what it is for: a library change is a reason to read the
 * library again, a progress report is the status itself plus, when the pass has
 * ended, something to announce, and a media failure is a failure.
 *
 * The two callbacks come in as a ref rather than as dependencies: they are
 * inline arrows at the call site, and a new identity every render would tear
 * every subscription down and build it again, over and over.
 */
export function useScanLifecycle(
  spaceId: number,
  notices: {
    onCompletion: (status: ScanStatus) => void;
    onError: (error: AppError, retry?: () => Promise<unknown>) => void;
  },
) {
  const client = useQueryClient();
  const latest = useLatestRef(notices);
  const scan = useQuery({
    queryKey: ['scan', spaceId],
    queryFn: libraryApi.scanStatus,
    refetchInterval: 700,
    retry: false,
  });
  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const unlisten: UnlistenFn[] = [];
    // Coalesced, because a pass reports after every file and each report would
    // otherwise be a read of two whole queries.
    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void client.invalidateQueries({ queryKey: ['videos', spaceId] });
        void client.invalidateQueries({ queryKey: ['directories', spaceId] });
      }, 200);
    };
    const subscriptions = [
      backendEvents.onLibraryChanged(() => {
        if (!disposed) refresh();
      }),
      backendEvents.onScanProgress((status) => {
        if (disposed) return;
        client.setQueryData(['scan', spaceId], status);
        if (shouldAnnounceScan(status)) latest.current.onCompletion(status);
        refresh();
      }),
      backendEvents.onMediaError((error) => {
        if (!disposed) latest.current.onError(normalizeError(error));
      }),
    ];
    for (const subscription of subscriptions) {
      void subscription
        .then((stop) => {
          if (disposed) stop();
          else unlisten.push(stop);
        })
        .catch((cause) => {
          if (!disposed) latest.current.onError(normalizeError(cause));
        });
    }
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const stop of unlisten) stop();
    };
  }, [client, spaceId, latest]);
  async function controlScan(action: 'pause' | 'resume' | 'cancel') {
    try {
      await libraryApi.controlScan(action);
      await client.invalidateQueries({ queryKey: ['scan', spaceId] });
    } catch (cause) {
      latest.current.onError(normalizeError(cause), () =>
        libraryApi.controlScan(action),
      );
    }
  }
  return { scan, controlScan };
}
