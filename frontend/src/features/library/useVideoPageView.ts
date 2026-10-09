import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { useVideos } from './useVideos';
import { clearFilters, useLibraryView } from './libraryView';
import type { SortOrder } from './libraryView';
import { defaultSort, listingAt } from './listing';

/**
 * A listing page, as the page draws it: the records of the page being read,
 * where the user has got to in the list, and the controls that narrow it.
 *
 * The filtering, the ordering and the counting are not here any more. The page
 * holds one page of records, and a search run over them would answer about them
 * rather than about the library — as would a page count worked out from them
 * (ADR 0016) — so what is left is what a page can still answer for itself: which
 * screen of the list it draws, and whether anything is narrowing it.
 *
 * The three things a control moves — the search, the folder, the order — are
 * written straight into the view state the library reads its query from, so a
 * control never has to know what the list is asked for, and a page never has to
 * ask again by hand.
 */
export function useVideoPageView() {
  const { videos: collection, index, turnTo, pageKey } = useVideos();
  const { pathname } = useLocation();
  const { search, setSearch, folder, setFolder, sorts, setSort } =
    useLibraryView();
  // The order this listing is read in: the one the user last chose for it, and
  // the one it opens on otherwise. Every listing remembers its own, so changing
  // how 最近播放页 is read does not reorder the library behind it. The route is
  // the key, and the four pages that draw a header are the four routes that are
  // a listing; 设置页 draws none, and the library is what is left over.
  const listing = listingAt(pathname) ?? '/';
  const sort = sorts[listing] ?? defaultSort(listing);
  const items = collection.data?.items;
  const folders = useMemo(
    () => [...new Set((items ?? []).map((video) => video.folder_path))],
    [items],
  );
  // Whether anything is narrowing the list, which is the one thing the list
  // itself needs to know: it says "nothing matched" rather than "nothing here",
  // and offers the way back. It does not need to know which filter it was — the
  // controls are the header's, and they are handed the values below. Handing
  // them out here as well put one fact at two addresses, and left every reader
  // of the list re-deriving `search || folder` for itself.
  //
  // Which of the two counts as a filter is [`clearFilters`]'s answer too, and
  // the order is in neither: it says how to read a list, not which part of it to
  // read, and a list sorted differently is not a narrowed one.
  const filtered = search !== '' || folder !== '';
  return {
    // The list this page is a page of, records and page together. It is what the
    // grid is mounted against, so turning a page starts the new one at the top,
    // and so does anything that describes another list.
    collectionKey: pageKey,
    videos: items ?? [],
    total: collection.data?.total ?? 0,
    index,
    turnTo,
    filtered,
    clearFilters,
    headerProps: {
      folders,
      search,
      folder,
      sort,
      onSearchChange: setSearch,
      onFolderChange: setFolder,
      onSortChange: (value: SortOrder) => setSort(listing, value),
    },
  };
}
