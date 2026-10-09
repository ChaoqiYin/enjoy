import { expect, it } from 'vitest';
import { pageIndexOf, useLibraryView } from './libraryView';

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
