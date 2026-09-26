import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryContext } from './LibraryProvider';
import { clearFilters, selectVideos, useLibraryView } from './libraryView';
import type { SortOrder } from './libraryView';
import { useSpace } from '../space/SpaceProvider';
export function useVideoPageView(page: '/' | '/favorites' | '/history') {
  const library = useLibraryContext();
  const { i18n } = useTranslation();
  const { id: spaceId } = useSpace();
  const { search, setSearch, folder, setFolder, sorts, setSort } =
    useLibraryView();
  const sort = sorts[page] ?? (page === '/history' ? 'played' : 'newest');
  const videos = useMemo(
    () =>
      selectVideos(
        library.videos.data ?? [],
        page,
        search,
        folder,
        sort,
        i18n.language,
      ),
    [library.videos.data, page, search, folder, sort, i18n.language],
  );
  const folders = useMemo(
    () => [
      ...new Set((library.videos.data ?? []).map((video) => video.folder_path)),
    ],
    [library.videos.data],
  );
  return {
    page,
    // The space is part of what makes a collection that collection, and the key
    // is what the list is mounted against: leaving it out would keep the old
    // space's scroll position when the space changes with nothing typed and
    // nothing filtered, where the filter changes above would not.
    collectionKey: JSON.stringify([spaceId, page, search, folder, sort]),
    videos,
    search,
    folder,
    sort,
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
