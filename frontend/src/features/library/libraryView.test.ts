import { beforeEach, expect, it } from 'vitest';
import { pageIndexOf, useLibraryView } from './libraryView';

beforeEach(() => {
  useLibraryView.setState({
    search: '',
    folder: '',
    sorts: {},
    viewModes: {},
    page: { listing: '', index: 0 },
  });
});

it('keeps page sorting separate while retaining filters', () => {
  useLibraryView.getState().setSearch('query');
  useLibraryView.getState().setSort('/', 'name');
  useLibraryView.getState().setSort('/history', 'played');
  expect(useLibraryView.getState().search).toBe('query');
  expect(useLibraryView.getState().sorts).toEqual({
    '/': 'name',
    '/history': 'played',
  });
});

it('a place in a list belongs to the list it was taken in', () => {
  useLibraryView.getState().setPage('one', 2);
  // The user has turned to the third page of this list, and coming back to the
  // same list finds them where they left it.
  expect(pageIndexOf('one')).toBe(2);

  // Another list is one they have not turned a page of. Without this the index
  // would be read against a list it was never taken in: after a search the
  // third page of the whole library is the third page of the matches that
  // happen to exist, and usually a page that is not there at all.
  expect(pageIndexOf('another')).toBe(0);

  // And the list they left is still where they left it.
  expect(pageIndexOf('one')).toBe(2);
});

it('a view mode is remembered per page, as the order is', () => {
  // The other half of the same约定: 视频库 read as rows does not read 收藏 as rows.
  // Which shape a page opens in when it has not been reshaped is not this
  // module's answer — `useVideoPageView` reads that off the vocabulary — so what
  // is asserted here is only the keying: a page that has been reshaped has an
  // entry, and another page does not.
  const reshaped = (listing: string) =>
    useLibraryView.getState().viewModes[listing];
  expect(reshaped('/')).toBeUndefined();
  useLibraryView.getState().setViewMode('/', 'table');
  expect(reshaped('/')).toBe('table');
  expect(reshaped('/favorites')).toBeUndefined();
  // Reading another page in another shape does not disturb the first.
  useLibraryView.getState().setViewMode('/favorites', 'list');
  expect(reshaped('/')).toBe('table');
  expect(reshaped('/favorites')).toBe('list');

  // The order and the shape are two answers about one page, and moving one
  // leaves the other alone.
  useLibraryView.getState().setSort('/', 'name');
  expect(reshaped('/')).toBe('table');
});
