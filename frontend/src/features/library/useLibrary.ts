import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { libraryApi, normalizeError } from '../../shared/api';
import type { AppError, ScanStatus, Space, Video } from '../../shared/api';
import { clearFilters } from './libraryView';
import { useAdoptSpace, useSpace } from '../space/SpaceProvider';
import { shouldAnnounceScan } from './scanFeedback';

export function useLibrary() {
  const client = useQueryClient();
  // The one place the current space is read. Everything below — every cache
  // key and every command — is addressed to it, so a stale read here would be
  // the only way to write into the wrong space (ADR 0012).
  const { id: spaceId } = useSpace();
  const adopt = useAdoptSpace();
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
  //
  // One marker per space, because the marker is about a card in a list and the
  // lists are different ones: leaving a space and coming back has to find the
  // marker where it was left, not cleared by the visit to somewhere else.
  const [lastPlayed, setLastPlayed] = useState<Record<number, number>>({});
  const lastPlayedId = lastPlayed[spaceId] ?? null;
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
  const [dismissedQueryErrors, setDismissedQueryErrors] = useState<unknown[]>(
    [],
  );
  const videos = useQuery({
    queryKey: ['videos', spaceId],
    queryFn: () => libraryApi.list(spaceId),
    retry: false,
  });
  const directories = useQuery({
    queryKey: ['directories', spaceId],
    queryFn: () => libraryApi.directories(spaceId),
    retry: false,
  });
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
    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void client.invalidateQueries({ queryKey: ['videos', spaceId] });
        void client.invalidateQueries({ queryKey: ['directories', spaceId] });
      }, 200);
    };
    const subscriptions = [
      listen('library-changed', () => {
        if (!disposed) refresh();
      }),
      listen<ScanStatus>('scan-progress', ({ payload }) => {
        if (disposed) return;
        client.setQueryData(['scan', spaceId], payload);
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
  }, [client, spaceId]);

  // Everything cached for one space, marked for reading again. Named once
  // because two things need it -- an action that may have changed what a space
  // holds, and a move into a space whose answer may be in the cache from an
  // earlier visit -- and the set of keys has to grow together either way.
  const refreshSpace = (id: number) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['videos', id] }),
      client.invalidateQueries({ queryKey: ['directories', id] }),
      client.invalidateQueries({ queryKey: ['scan', id] }),
    ]);

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
      await refreshSpace(spaceId);
      setPending((count) => count - 1);
    }
  }

  // Every operation the interface can ask of the library. They live here, beside
  // the state they move, because a page should know *what* to do — play this
  // video, rescan the library — and not which command carries it. Keeping the
  // translation in one place is also what lets a change to the transport, such
  // as a space id on every command, touch only this file.
  const play = (video: Video) =>
    // The marker is written after the call resolves, not beside the click: a
    // launch that never reached the system player raises instead, `run` turns
    // that into a notice, and the card keeps whatever marker it had — the same
    // rule the record follows, where a failed launch does not count as a play.
    run(async () => {
      await libraryApi.play(spaceId, video.path);
      setLastPlayed((played) => ({ ...played, [spaceId]: video.id }));
    });
  const toggleFavorite = (video: Video) =>
    run(() => libraryApi.favorite(spaceId, video.path, !video.favorite));
  const reveal = (video: Video) => run(() => libraryApi.reveal(video.path));
  const refreshInfo = (video: Video) =>
    run(() => libraryApi.refreshInfo(spaceId, video.path));
  const regenerateThumbnail = (video: Video) =>
    run(() => libraryApi.regenerate(spaceId, video.path));
  const regenerateAllThumbnails = () =>
    run(() => libraryApi.regenerate(spaceId, null));
  const removeVideo = (video: Video) =>
    run(() => libraryApi.remove(spaceId, video.path));
  const addDirectories = (paths: string[]) =>
    run(async () => {
      for (const path of paths) await libraryApi.addDirectory(spaceId, path);
    });
  const removeDirectory = (path: string) =>
    run(() => libraryApi.removeDirectory(spaceId, path));
  const rescan = () => run(() => libraryApi.rescan(spaceId));

  // Creating, renaming and removing a space live here rather than beside the
  // provider that holds the current space, because they move the library itself:
  // they decide *which* one is being read.
  //
  // Naming reports where the name was typed, so the two that name a space raise
  // instead of writing a notice -- the dialog that asked is the one place the
  // reason belongs, and it stays open with the text still in it. Removing has no
  // dialog to report into, so it goes out through `run` like every other action
  // that could not be carried out.
  // The list of spaces is not part of what one space holds, so it is not in
  // `refreshSpace`; what changes it is the command, not the move. Only creating,
  // renaming and removing change the set at all, and two of those three leave
  // the interface exactly where it was — the answer they give is the space
  // being shown, unchanged — so a refresh attached to moving would never run for
  // them. The list would then keep a name that is no longer the one on the row,
  // or a space that is no longer there, and the next rename of that row would be
  // refused for a space that does not exist. Reading it again before the move is
  // decided is what keeps those two in step.
  const refreshSpaces = () =>
    client.invalidateQueries({ queryKey: ['spaces'] });

  async function moveInto(action: Promise<Space>) {
    // The command is asked first, because its answer is what says whether the
    // interface is moving at all: renaming, or removing a space that is not the
    // one being shown, leaves it exactly where it was, and what it is showing
    // still stands.
    const next = await action;
    await refreshSpaces();
    if (next.id === spaceId) return;
    // Everything below is about a move. The filters go before the space does,
    // so that no render puts the library that is arriving under the search that
    // was about the library being left; the caches are refreshed after it, for
    // the space that is now the one on screen. That space may have been read
    // earlier in this session, and its cache has no way of knowing the interface
    // left and came back -- so without that it could show what the space held
    // the last time it was open.
    clearFilters();
    adopt(next);
    await refreshSpace(next.id);
  }
  const createSpace = (name: string) => moveInto(libraryApi.createSpace(name));
  const renameSpace = (target: number, name: string) =>
    moveInto(libraryApi.renameSpace(target, name));
  const removeSpace = (target: number) =>
    run(() => moveInto(libraryApi.deleteSpace(target)));
  // Switching never fails for a reason the user has to read: the space was in
  // the list they picked from a moment ago, and a rejection means it is gone,
  // which the notice in `run` says as well as anything could.
  const switchSpace = (target: number) =>
    run(() => moveInto(libraryApi.switchSpace(target)));

  async function controlScan(action: 'pause' | 'resume' | 'cancel') {
    try {
      await libraryApi.controlScan(action);
      await client.invalidateQueries({ queryKey: ['scan', spaceId] });
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
    play,
    toggleFavorite,
    reveal,
    refreshInfo,
    regenerateThumbnail,
    regenerateAllThumbnails,
    removeVideo,
    addDirectories,
    removeDirectory,
    rescan,
    controlScan,
    createSpace,
    renameSpace,
    removeSpace,
    switchSpace,
  };
}
