import { create } from 'zustand';
import type { Video } from '../../shared/api';

export type SortOrder = 'newest' | 'played' | 'name';
interface LibraryView {
  search: string;
  folder: string;
  sorts: Record<string, SortOrder>;
  setSearch: (value: string) => void;
  setFolder: (value: string) => void;
  setSort: (page: string, value: SortOrder) => void;
}

export const useLibraryView = create<LibraryView>((set) => ({
  search: '',
  folder: '',
  sorts: {},
  setSearch: (search) => set({ search }),
  setFolder: (folder) => set({ folder }),
  setSort: (page, value) =>
    set((state) => ({ sorts: { ...state.sorts, [page]: value } })),
}));

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
 */
export function clearFilters() {
  useLibraryView.setState({ search: '', folder: '' });
}

export function selectVideos(
  videos: Video[],
  page: string,
  search: string,
  folder: string,
  sort: SortOrder,
  language: string,
): Video[] {
  const query = search.toLocaleLowerCase(language);
  return videos
    .filter(
      (video) =>
        video.file_name.toLocaleLowerCase(language).includes(query) &&
        (!folder || video.folder_path === folder) &&
        (page !== '/favorites' || video.favorite) &&
        (page !== '/history' || video.last_played_at !== null),
    )
    .sort((a, b) => {
      const difference =
        sort === 'name'
          ? a.file_name.localeCompare(b.file_name, language)
          : sort === 'played'
            ? (b.last_played_at ?? 0) - (a.last_played_at ?? 0)
            : b.created_at - a.created_at;
      return difference || b.id - a.id;
    });
}
