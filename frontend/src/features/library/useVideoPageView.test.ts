import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { libraryApi } from '../../shared/api';
import { idleScan } from '../../test/fixtures';
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
    page: { listing: '', index: 0 },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

function mount() {
  return renderHook(
    () => ({ library: useLibrary(), view: useVideoPageView() }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            MemoryRouter,
            { initialEntries: ['/'] },
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
