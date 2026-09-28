import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideos } from './useVideos';
import { clearFilters, selectVideos, useLibraryView } from './libraryView';
import type { SortOrder } from './libraryView';
import { useSpace } from '../space/SpaceProvider';
export function useVideoPageView(page: '/' | '/favorites' | '/history') {
  const { videos: collection } = useVideos();
  const { i18n } = useTranslation();
  const { id: spaceId } = useSpace();
  const { search, setSearch, folder, setFolder, sorts, setSort } =
    useLibraryView();
  const sort = sorts[page] ?? (page === '/history' ? 'played' : 'newest');
  const videos = useMemo(
    () =>
      selectVideos(
        collection.data ?? [],
        page,
        search,
        folder,
        sort,
        i18n.language,
      ),
    [collection.data, page, search, folder, sort, i18n.language],
  );
  const folders = useMemo(
    () => [
      ...new Set((collection.data ?? []).map((video) => video.folder_path)),
    ],
    [collection.data],
  );
  // Whether anything is narrowing the list, which is the one thing the list
  // itself needs to know: it says "nothing matched" rather than "nothing here",
  // and offers the way back. It does not need to know which filter it was — the
  // controls are the header's, and they are handed the values below. Handing
  // them out here as well put one fact at two addresses, and left every reader
  // of the list re-deriving `search || folder` for itself.
  //
  // Which of the two counts as a filter is [`clearFilters`]'s answer too, and
  // the sort order is in neither: it says how to read a list, not which part of
  // it to read, and a list sorted differently is not a narrowed one.
  const filtered = search !== '' || folder !== '';
  return {
    page,
    // The space is part of what makes a collection that collection, and the key
    // is what the list is mounted against: leaving it out would keep the old
    // space's scroll position when the space changes with nothing typed and
    // nothing filtered, where the filter changes above would not.
    collectionKey: JSON.stringify([spaceId, page, search, folder, sort]),
    videos,
    filtered,
    clearFilters,
    headerProps: {
      folders,
      search,
      folder,
      sort,
      onSearchChange: setSearch,
      onFolderChange: setFolder,
      onSortChange: (value: SortOrder) => setSort(page, value),
    },
  };
}
