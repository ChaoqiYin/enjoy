import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import { idleScan, video } from '../../test/fixtures';
import { SpaceProvider } from '../space/SpaceProvider';
import { LibraryProvider } from './LibraryProvider';
import { useLibrary } from './useLibrary';
import { useVideoPageView } from './useVideoPageView';
import { useLibraryView } from './libraryView';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const space = { id: 1, name: 'Films' };
const other = { id: 2, name: 'Shows' };
let client: QueryClient;

beforeEach(() => {
  vi.mocked(listen).mockResolvedValue(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(libraryApi, 'listSpaces').mockResolvedValue([space, other]);
  vi.spyOn(libraryApi, 'list').mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(libraryApi, 'directories').mockResolvedValue([]);
  vi.spyOn(libraryApi, 'scanStatus').mockResolvedValue(idleScan());
  useLibraryView.setState({
    search: '',
    folder: '',
    sorts: {},
    viewModes: {},
    page: { listing: '', index: 0 },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function mount(path = '/') {
  return renderHook(
    () => ({ library: useLibrary(), view: useVideoPageView() }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(
              SpaceProvider,
              { initialSpace: space, children },
              createElement(LibraryProvider, { children }),
            ),
          ),
        ),
    },
  );
}

it('restarts the list on a switch, so it comes back at the top', async () => {
  const switchTo = vi.spyOn(libraryApi, 'switchSpace').mockResolvedValue(other);
  const { result } = mount();
  const before = result.current.view.collectionKey;
  await act(() => result.current.library.spaceCommands.switchSpace(other.id));
  expect(switchTo).toHaveBeenCalledWith(other.id);
  // The key is the identity of the collection the list is mounted against, and
  // mounting again is what resets the scroll position. A switch with nothing
  // typed and nothing filtered leaves the filters alone, so the space is the
  // only part of the key that can carry the change.
  expect(result.current.view.collectionKey).not.toBe(before);
});

it('restarts the list on a turn of the page, so the next page is read from its top', async () => {
  const { result } = mount();
  const before = result.current.view.collectionKey;
  act(() => result.current.view.turnTo(1));
  // A page the user has turned to is read from its beginning, not from wherever
  // the last one was scrolled to.
  expect(result.current.view.collectionKey).not.toBe(before);
  expect(result.current.view.index).toBe(1);
});

it('goes back to the beginning when the description changes', () => {
  const { result } = mount();
  act(() => result.current.view.turnTo(2));
  expect(result.current.view.index).toBe(2);
  // A search describes another list — the third page of the whole library is not
  // the third page of the matches — and the user is at the beginning of the list
  // they have just described rather than on a page that may not exist. The same
  // answer covers a change of folder, of order and of space, because all four are
  // the same thing here: another description (`libraryView`).
  act(() => result.current.view.toolbarProps.onSearchChange('holiday'));
  expect(result.current.view.index).toBe(0);
  expect(result.current.view.collectionKey).not.toBe('');
});

it('opens in the drawing’s shape, and hands the chosen one on', () => {
  const { result } = mount();
  // Every page the user has not reshaped opens in 网格, which is the only shape
  // the drawings show (ADR 0017).
  expect(result.current.view.toolbarProps.viewMode).toBe('grid');
  act(() => result.current.view.toolbarProps.onViewModeChange('table'));
  expect(result.current.view.toolbarProps.viewMode).toBe('table');
});

it('remembers the shape each page was reshaped into, and only that page', () => {
  const favorite = mount('/favorites');
  act(() => favorite.result.current.view.toolbarProps.onViewModeChange('list'));
  expect(favorite.result.current.view.toolbarProps.viewMode).toBe('list');
  favorite.unmount();

  // 视频库 was never reshaped, so it still opens in 网格: the shape is the
  // page's, which is why it is remembered by listing rather than globally.
  const library = mount();
  expect(library.result.current.view.toolbarProps.viewMode).toBe('grid');
  library.unmount();

  // And 收藏 keeps the shape its own user chose, across a visit to another page.
  const again = mount('/favorites');
  expect(again.result.current.view.toolbarProps.viewMode).toBe('list');
});

it('offers the folder being read even when the page does not hold its records', async () => {
  // The facet's source is the page in hand, which is all the interface has: there
  // is no command that lists a library's folders (ADR 0016), and the roots a
  // library is configured with are not what the records carry — each record's
  // `folder_path` is its own directory. So the page's folders are the options,
  // and the one the list is narrowed to is added to them: a control that could
  // not show the folder it is filtering by would be drawing a value it does not
  // have.
  vi.mocked(libraryApi.list).mockResolvedValue({
    items: [
      video({ id: 1, folder_path: '/movies' }),
      video({ id: 2, folder_path: '/shows' }),
    ],
    total: 2,
  });
  useLibraryView.setState({ folder: '/elsewhere' });
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.view.videos.map((item) => item.id)).toEqual([1, 2]),
  );
  expect(result.current.view.toolbarProps.folders).toEqual([
    '/elsewhere',
    '/movies',
    '/shows',
  ]);
});
