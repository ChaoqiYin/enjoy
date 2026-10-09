import { create } from 'zustand';
import type { SortOrder } from './listing';

// The words a list is read in are the listing's, not this store's; they are
// handed on from here because every control that names one already imports this
// module, and a second path to the same vocabulary would be a second place it
// could change.
export type { SortOrder } from './listing';

interface LibraryView {
  search: string;
  folder: string;
  sorts: Record<string, SortOrder>;
  /**
   * Which page of which listing the user is reading.
   *
   * The two travel together because an index means nothing on its own: it is an
   * index *of a description*, and a description that has changed describes
   * records the user has not turned any pages of. Reading them apart is how a
   * page index comes to be applied to a list nobody asked it of — the third page
   * of a search that has four matches in it.
   */
  page: { listing: string; index: number };
  setSearch: (value: string) => void;
  setFolder: (value: string) => void;
  setSort: (listing: string, value: SortOrder) => void;
  setPage: (listing: string, index: number) => void;
}

export const useLibraryView = create<LibraryView>((set) => ({
  search: '',
  folder: '',
  sorts: {},
  // A listing nothing matches, which is the first page of every listing: no
  // description is this one, so every list starts at its beginning.
  page: { listing: '', index: 0 },
  setSearch: (search) => set({ search }),
  setFolder: (folder) => set({ folder }),
  setSort: (listing, value) =>
    set((state) => ({ sorts: { ...state.sorts, [listing]: value } })),
  setPage: (listing, index) => set({ page: { listing, index } }),
}));

/**
 * Which page of the listing described by `listing` is being read.
 *
 * The first page of any list the user has not turned a page of, which is what
 * follows from holding the index beside the description it was taken in: a
 * search that was typed, a folder that was picked, an order that was changed and
 * a space that was switched to all describe a different listing, and the user is
 * at its beginning rather than wherever they happened to be in the last one.
 *
 * Read off the store rather than subscribed to, because every caller is a hook
 * that already re-renders when this store changes.
 */
export function pageIndexOf(listing: string): number {
  const { page } = useLibraryView.getState();
  return page.listing === listing ? page.index : 0;
}

/**
 * Puts the filters back to where a library the user has not narrowed down yet
 * finds them.
 *
 * It is a function rather than two calls at each site because it answers a rule
 * rather than doing two assignments: which of the things held here are filters,
 * and so belong to the library on screen, as opposed to the sort order, which is
 * how the user wants to read a list and follows them from one to the next. Two
 * callers need it — the button that clears the filters under a search that found
 * nothing, and moving into another space — and neither should decide the answer
 * for itself.
 *
 * It needs no word about the page index: clearing the filters describes a
 * listing the user has not read yet, and [`pageIndexOf`] answers for one of
 * those on its own.
 */
export function clearFilters() {
  useLibraryView.setState({ search: '', folder: '' });
}
