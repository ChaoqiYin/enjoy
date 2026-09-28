import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { libraryApi, normalizeError } from '../../shared/api';
import type { AppError, ScanStatus, Space, Video } from '../../shared/api';
import { clearFilters } from './libraryView';
import { useAdoptSpace, useSpace } from '../space/SpaceProvider';
import { useNoticeState } from './notices';
import { isScanRunning } from './scanFeedback';
import { useScanLifecycle } from './scanLifecycle';
import type { Busy } from './useBusy';
import type { Directories } from './useDirectories';
import type { Notices } from './useNotices';
import type { Scan } from './useScan';
import type { SpaceCommands } from './useSpaceCommands';
import type { VideoActions } from './useVideoActions';
import type { Videos } from './useVideos';

/**
 * Everything the library holds, everything it says, and every command it can be
 * asked to carry out — assembled, and handed over as seven slices.
 *
 * This is the only module that knows the whole of it. Each slice is the
 * interface of the module that hands it out — `useVideos`, `useScan`,
 * `useNotices`, `useSpaceCommands`, `useDirectories`, `useVideoActions`,
 * `useBusy` — and a page imports the one it needs: a page that wants one
 * boolean should not have to know about the other twenty-seven keys, and with
 * the value shaped this way the page it hands them to cannot name them either.
 *
 * The slice types are declared beside those hooks rather than here, so what a
 * consumer may name is decided by the consumer's own module, and this assembly
 * is checked against it. That is the direction that fails loudly: a slice
 * assembled without a key its readers were promised is a compile error here,
 * where a hand-copied field list would have gone on quietly handing out one
 * thing fewer.
 *
 * Two of the slices are not assembled here at all: the scan lifecycle and the
 * notices have modules of their own, and what is left is the part they share —
 * the queries, the in-flight counter, and the commands.
 */
export function useLibrary(): Library {
  const client = useQueryClient();
  // The one place the current space is read. Everything below — every cache
  // key and every command — is addressed to it, so a stale read here would be
  // the only way to write into the wrong space (ADR 0012).
  const { id: spaceId } = useSpace();
  const adopt = useAdoptSpace();
  const notices = useNoticeState();
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
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
  const { scan, controlScan } = useScanLifecycle(spaceId, {
    onCompletion: notices.setCompletion,
    onError: notices.setError,
  });

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
    notices.setError(null);
    // A new action makes the previous completion notice stale: without this it
    // stays on screen showing counts from the scan that already finished, and
    // is only replaced once the new scan completes with something to announce.
    notices.setCompletion(null);
    setPending((count) => count + 1);
    try {
      await action();
    } catch (cause) {
      const failure = normalizeError(cause);
      if (failure.code !== 'media.scan.cancelled')
        notices.setError(failure, action);
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
  const toggleShared = (video: Video) =>
    run(() => libraryApi.shared(spaceId, video.path, !video.shared));
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

  // A failure the user has already read about, or one an action of theirs is
  // still being carried out for, is not worth reporting a second time.
  const failedQuery = [videos, directories, scan].find(
    (query) =>
      query.error && !notices.dismissedQueryErrors.includes(query.error),
  );
  const retryError = notices.failure
    ? notices.failure.retry
      ? () => run(notices.failure!.retry!)
      : undefined
    : failedQuery
      ? () => run(() => failedQuery.refetch({ throwOnError: true }))
      : undefined;

  return {
    // 视频集合
    videos: { videos, lastPlayedId },
    // 扫描生命周期
    scan: {
      status: scan.data,
      isRunning: isScanRunning(scan.data),
      controlScan,
    },
    // 通知
    notices: {
      completion: notices.completion,
      dismissCompletion: notices.dismissCompletion,
      copyHint: notices.copyHint,
      showCopyHint: notices.showCopyHint,
      dismissCopyHint: notices.dismissCopyHint,
      error:
        notices.failure?.error ??
        (failedQuery ? normalizeError(failedQuery.error) : null),
      retryError: busy ? undefined : retryError,
      setError: (value: AppError | null) => {
        notices.setError(value);
        if (value === null)
          notices.dismissQueryErrors([
            videos.error,
            directories.error,
            scan.error,
          ]);
      },
    },
    // 空间
    spaceCommands: { createSpace, renameSpace, removeSpace, switchSpace },
    // 目录
    directories: {
      directories,
      addDirectories,
      removeDirectory,
      rescan,
      regenerateAllThumbnails,
    },
    // 单条视频的动作
    videoActions: {
      play,
      toggleFavorite,
      toggleShared,
      reveal,
      refreshInfo,
      regenerateThumbnail,
      removeVideo,
    },
    // 忙闲
    busy: { busy },
  };
}

/**
 * The whole of what the provider carries: the seven slices, and nothing else.
 *
 * Named rather than inferred from the assembly so that every slice is checked
 * against the type its own module declares — the types are the interfaces, and
 * this is where they are held to the state they are built from.
 */
export type Library = {
  videos: Videos;
  scan: Scan;
  notices: Notices;
  spaceCommands: SpaceCommands;
  directories: Directories;
  videoActions: VideoActions;
  busy: Busy;
};
