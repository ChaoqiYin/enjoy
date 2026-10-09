import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import type { ScanStatus, Video } from '../../shared/api';
import { SpaceProvider } from '../space/SpaceProvider';
import { idleScan } from '../../test/fixtures';
import { useLibrary } from './useLibrary';
import { useLibraryView } from './libraryView';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
const failure = {
  code: 'media.player.start_failed',
  params: {},
  errorId: 'err_retry',
};
const video: Video = {
  id: 7,
  path: '/movies/example.mp4',
  file_name: 'example.mp4',
  folder_path: '/movies',
  file_size: 1024,
  modified_at: 0,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: false,
  shared: false,
  play_count: 0,
  last_played_at: null,
  created_at: 0,
  updated_at: 0,
};
let client: QueryClient;
beforeEach(() => {
  vi.mocked(listen).mockResolvedValue(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([space, other]);
  vi.spyOn(libraryApi, 'list').mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(libraryApi, 'directories').mockResolvedValue([]);
  useLibraryView.setState({
    search: '',
    folder: '',
    sorts: {},
    page: { listing: '', index: 0 },
  });
  vi.spyOn(libraryApi, 'rescan').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'scanStatus').mockResolvedValue(idleScan());
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const space = { id: 1, name: 'Library' };
const other = { id: 2, name: 'Other' };

function mount(path = '/') {
  return renderHook(useLibrary, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client },
        // Which page of the library is on screen is the route's answer, and the
        // library reads it there because the question it asks depends on it.
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(SpaceProvider, { initialSpace: space, children }),
        ),
      ),
  });
}

it('asks the backend for one page of the list the page is a page of', async () => {
  mount('/favorites');
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledWith({
      spaceId: space.id,
      // Nothing typed and nothing picked: the two filters say nothing rather
      // than saying "empty".
      search: undefined,
      folder: undefined,
      // 收藏页 is the library holding one condition, and 最近添加 is how it opens.
      only: 'favorite',
      sort: 'added',
      offset: 0,
      limit: 24,
    }),
  );
});

it('turns to another page of the same list', async () => {
  vi.mocked(libraryApi.list).mockResolvedValue({ items: [], total: 60 });
  const { result } = mount();
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledTimes(1),
  );
  await act(() => result.current.videos.turnTo(1));
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 24, limit: 24, spaceId: space.id }),
    ),
  );
  expect(result.current.videos.index).toBe(1);
});

it('narrows to what was typed, from the first page of the narrower list', async () => {
  vi.mocked(libraryApi.list).mockResolvedValue({ items: [], total: 60 });
  const { result } = mount();
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledTimes(1),
  );
  await act(() => result.current.videos.turnTo(2));
  await waitFor(() => expect(result.current.videos.index).toBe(2));

  // What the user types describes another list. The third page of the library is
  // not the third page of the matches: read as one, it would ask for a page of
  // matches that is not there, and page past the end of what they are looking
  // at.
  act(() => useLibraryView.getState().setSearch('holiday'));
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'holiday', offset: 0 }),
    ),
  );
  expect(result.current.videos.index).toBe(0);
});
it('falls back to the last page when the list shrinks under the user', async () => {
  // Three pages of a list the user has walked to its end.
  vi.mocked(libraryApi.list).mockResolvedValue({ items: [], total: 72 });
  const { result } = mount();
  await waitFor(() =>
    expect(vi.mocked(libraryApi.list)).toHaveBeenCalledTimes(1),
  );
  await act(() => result.current.videos.turnTo(2));
  await waitFor(() => expect(result.current.videos.index).toBe(2));

  // A rescan drops records, and the third page is no longer there. The index is
  // clamped to the last page that is, and the next request asks for that one
  // rather than the one that is gone: past the end there are no records to draw
  // and no footer to leave by, which is how a stale index turns into "the
  // library is empty" with the way back gone (ADR 0016, `Pagination`).
  vi.mocked(libraryApi.list).mockResolvedValue({ items: [], total: 30 });
  await act(() => result.current.directories.rescan());
  await waitFor(() => expect(result.current.videos.index).toBe(1));
  expect(vi.mocked(libraryApi.list)).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 24, limit: 24 }),
  );
  expect(useLibraryView.getState().page.index).toBe(1);
});
it('retries the failed action and clears its error after success', async () => {
  const rescan = vi.mocked(libraryApi.rescan);
  rescan.mockRejectedValueOnce(failure).mockResolvedValueOnce([]);
  const { result } = mount();
  await act(() => result.current.directories.rescan());
  expect(result.current.notices.error?.errorId).toBe('err_retry');
  expect(rescan).toHaveBeenCalledTimes(1);
  await act(() => result.current.notices.retryError!());
  expect(rescan).toHaveBeenCalledTimes(2);
  expect(result.current.notices.error).toBeNull();
  expect(result.current.busy.busy).toBe(false);
});
it('surfaces directory query failures and retries the directory request', async () => {
  vi.mocked(libraryApi.directories).mockRejectedValueOnce(failure);
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.notices.error?.errorId).toBe('err_retry'),
  );
  await act(() => result.current.notices.retryError!());
  await waitFor(() =>
    expect(result.current.directories.directories.isSuccess).toBe(true),
  );
  expect(result.current.notices.error).toBeNull();
});
it('allows scan query errors to be dismissed', async () => {
  vi.mocked(libraryApi.scanStatus).mockRejectedValue(failure);
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.notices.error?.errorId).toBe('err_retry'),
  );
  act(() => result.current.notices.setError(null));
  expect(result.current.notices.error).toBeNull();
});
const completed = idleScan({
  phase: 'complete',
  changes: { added: 1, updated: 0, removed: 0 },
  discovered: 1,
  processed: 1,
  indexed: 1,
  metadataReady: 1,
  thumbnailsReady: 1,
  currentPath: '/movies',
});
it('clears the previous completion notice when a new action starts', async () => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();
  const capture = ((
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    handlers.set(event, handler);
    return Promise.resolve(() => {});
  }) as unknown as typeof listen;
  vi.mocked(listen).mockImplementation(capture);
  const { result } = mount();
  await waitFor(() => expect(handlers.has('scan-progress')).toBe(true));
  act(() => handlers.get('scan-progress')!({ payload: completed }));
  expect(result.current.notices.completion?.phase).toBe('complete');
  await act(() => result.current.directories.rescan());
  expect(result.current.notices.completion).toBeNull();
});

it('marks the video the launch reached the player for', async () => {
  const play = vi.spyOn(libraryApi, 'play').mockResolvedValue(undefined);
  const { result } = mount();
  await act(() => result.current.videoActions.play(video));
  expect(play).toHaveBeenCalledWith(space.id, video.path);
  expect(result.current.videos.lastPlayedId).toBe(video.id);
});

it('clears the filters of the library it left, and keeps the sort', async () => {
  vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(other);
  const { result } = mount();
  useLibraryView.setState({
    search: 'example',
    folder: '/movies',
    sorts: { '/': 'name' },
  });
  await act(() => result.current.spaceCommands.switchSpace(other.id));
  const view = useLibraryView.getState();
  // A search was about the library on screen; kept, it would hide everything in
  // the one that replaced it.
  expect(view.search).toBe('');
  expect(view.folder).toBe('');
  // The sort order is not a filter over a library, it is how the user wants to
  // read a list, so it comes with them.
  expect(view.sorts).toEqual({ '/': 'name' });
});

it('addresses a scan to the space being shown, not the one it was started from', async () => {
  const rescan = vi.spyOn(libraryApi, 'rescan').mockResolvedValue([]);
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(other);
  const { result } = mount();
  await act(() => result.current.spaceCommands.switchSpace(other.id));
  await act(() => result.current.directories.rescan());
  // A scan reads the directories saved for one space and writes back into that
  // same one, and which space that is comes from here rather than from the scan.
  expect(rescan).toHaveBeenCalledWith(other.id);
  expect(switchTo).toHaveBeenCalledWith(other.id);
});

it('remembers the played marker for the space it was played in', async () => {
  vi.spyOn(libraryApi, 'play').mockResolvedValue(undefined);
  const switchTo = vi.spyOn(libraryApi, 'switchSpace');
  const { result } = mount();
  await act(() => result.current.videoActions.play(video));
  expect(result.current.videos.lastPlayedId).toBe(video.id);

  // Nothing has been played in the other space yet, so it shows no marker --
  // the two libraries do not share which card was last handed to the player.
  switchTo.mockResolvedValue(other);
  await act(() => result.current.spaceCommands.switchSpace(other.id));
  expect(result.current.videos.lastPlayedId).toBeNull();

  // Coming back finds it where it was left, which is the whole point of keeping
  // one per space rather than one for the session.
  switchTo.mockResolvedValue(space);
  await act(() => result.current.spaceCommands.switchSpace(space.id));
  expect(result.current.videos.lastPlayedId).toBe(video.id);
});

it('leaves the played marker alone when the launch fails', async () => {
  vi.spyOn(libraryApi, 'play').mockRejectedValue(failure);
  const { result } = mount();
  await act(() => result.current.videoActions.play(video));
  // The marker follows the record, which counts only a launch that reached the
  // player; a rejected one is a notice, not a play.
  expect(result.current.videos.lastPlayedId).toBeNull();
  expect(result.current.notices.error?.errorId).toBe('err_retry');
});
