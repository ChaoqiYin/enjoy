import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryContext } from './LibraryProvider';
import { selectVideos, useLibraryView } from './libraryView';
import type { SortOrder } from './libraryView';
export function useVideoPageView(page: '/' | '/favorites' | '/history') {
  const library = useLibraryContext();
  const { i18n } = useTranslation();
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
    collectionKey: JSON.stringify([page, search, folder, sort]),
    videos,
    search,
    folder,
    sort,
    clearFilters: () => {
      setSearch('');
      setFolder('');
    },
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
