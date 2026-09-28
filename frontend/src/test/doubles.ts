import { vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Space, Video } from '../shared/api';
import type { Videos } from '../features/library/useVideos';
import type { Scan } from '../features/library/useScan';
import type { Notices } from '../features/library/useNotices';
import type { Busy } from '../features/library/useBusy';
import type { Directories } from '../features/library/useDirectories';
import type { VideoActions } from '../features/library/useVideoActions';
import type { SpaceCommands } from '../features/library/useSpaceCommands';
import type { Share } from '../features/share/useShare';

/**
 * A stand-in for each slice of the library, as a page sees one.
 *
 * Each builder returns the slice's **own declared type** — the type the slice
 * module hands out, not a shape copied from it — so a key added to a slice is a
 * compile error here and nowhere else, and a test cannot write half a double
 * and still pass. That was the failure this module answers: a page reading a
 * slice a test had built three keys of was passing for a reason the test never
 * stated, and would keep passing after the page started reading a fourth.
 *
 * It is a builder with overrides because a test says what it is about: a page
 * that only asks whether a pass is running should not have to spell out a scan
 * status, and one that does care can pass exactly that key.
 *
 * This module is not test code that runs — vitest collects `*.test.ts` only —
 * it is the stand-ins those tests are mounted on, kept where they can all find
 * them. Nothing the application itself imports reaches it.
 */

/**
 * A query nothing has answered yet, which is what a double needs to be: the
 * pages under test read `data` and `isPending` and nothing else, and a real
 * `UseQueryResult` carries a dozen members that describe how react-query got
 * there. The cast is written once, here, rather than at each of the doubles
 * below — everything around it stays checked.
 */
function pending<T>(data: T): UseQueryResult<T> {
  return { data, isPending: false } as unknown as UseQueryResult<T>;
}

/** The collection, and the card carrying the "last played" marker. */
export function videos(overrides: Partial<Videos> = {}): Videos {
  return {
    videos: pending<Video[]>([]),
    lastPlayedId: null,
    ...overrides,
  };
}

/** Whether a pass is running, what it is doing, and how to steer it. */
export function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    status: undefined,
    isRunning: false,
    controlScan: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Everything the library has to say. */
export function notices(overrides: Partial<Notices> = {}): Notices {
  return {
    error: null,
    retryError: undefined,
    setError: vi.fn(),
    completion: null,
    dismissCompletion: vi.fn(),
    copyHint: false,
    showCopyHint: vi.fn(),
    dismissCopyHint: vi.fn(),
    ...overrides,
  };
}

/** Whether the library is carrying out a command right now. */
export function busy(overrides: Partial<Busy> = {}): Busy {
  return { busy: false, ...overrides };
}

/** The folders the library is built from, and the commands over them. */
export function directories(overrides: Partial<Directories> = {}): Directories {
  return {
    directories: pending<string[]>([]),
    addDirectories: vi.fn(async () => {}),
    removeDirectory: vi.fn(async () => {}),
    rescan: vi.fn(async () => {}),
    regenerateAllThumbnails: vi.fn(async () => {}),
    ...overrides,
  };
}

/** What a page can ask of one video. */
export function videoActions(
  overrides: Partial<VideoActions> = {},
): VideoActions {
  return {
    play: vi.fn(async () => {}),
    toggleFavorite: vi.fn(async () => {}),
    toggleShared: vi.fn(async () => {}),
    reveal: vi.fn(async () => {}),
    refreshInfo: vi.fn(async () => {}),
    regenerateThumbnail: vi.fn(async () => {}),
    removeVideo: vi.fn(async () => {}),
    ...overrides,
  };
}

/** The four commands that change what the library is. */
export function spaceCommands(
  overrides: Partial<SpaceCommands> = {},
): SpaceCommands {
  return {
    createSpace: vi.fn(async () => {}),
    renameSpace: vi.fn(async () => {}),
    removeSpace: vi.fn(async () => {}),
    switchSpace: vi.fn(async () => {}),
    ...overrides,
  };
}

/** One space, as the space layer hands it out. */
export function space(overrides: Partial<Space> = {}): Space {
  return { id: 1, name: 'Library', ...overrides };
}

/**
 * The 共享服务, as a page or the navigation reads it.
 *
 * The commands answer `true`, which is what a caller has to be told before it
 * acts on them: leaving a space and closing the window both go through
 * `stop` and both stop short if it did not work.
 */
export function share(overrides: Partial<Share> = {}): Share {
  return {
    port: null,
    username: 'enjoy',
    password: 'sample-passw0rd',
    needsRestart: false,
    missingFiles: 0,
    devices: [],
    addresses: [],
    busy: false,
    error: null,
    dismissError: vi.fn(),
    start: vi.fn(async () => true),
    stop: vi.fn(async () => true),
    regeneratePassword: vi.fn(async () => true),
    ...overrides,
  };
}
