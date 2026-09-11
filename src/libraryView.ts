import { create } from 'zustand';
import type { Video } from './api';

export type SortOrder = 'newest' | 'played' | 'name';
interface LibraryView {
  search: string;
  folder: string;
  list: boolean;
  sorts: Record<string, SortOrder>;
  setSearch: (value: string) => void;
  setFolder: (value: string) => void;
  setList: (value: boolean) => void;
  setSort: (page: string, value: SortOrder) => void;
}

export const useLibraryView = create<LibraryView>((set) => ({
  search: '',
  folder: '',
  list: false,
  sorts: {},
  setSearch: (search) => set({ search }),
  setFolder: (folder) => set({ folder }),
  setList: (list) => set({ list }),
  setSort: (page, value) =>
    set((state) => ({ sorts: { ...state.sorts, [page]: value } })),
}));

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
