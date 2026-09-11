import { expect, it } from 'vitest';
import type { Video } from './api';
import { selectVideos, useLibraryView } from './libraryView';

const base: Video = {
  id: 1,
  path: '/a/one.mp4',
  file_name: 'one.mp4',
  folder_path: '/a',
  file_size: 1,
  modified_at: 0,
  duration_ms: null,
  width: null,
  height: null,
  codec: null,
  thumbnail_path: null,
  favorite: true,
  available: true,
  play_count: 1,
  last_played_at: 10,
  created_at: 30,
  updated_at: 30,
};
it('filters favorites and history consistently without mutating query data', () => {
  const videos = [
    base,
    { ...base, id: 2, favorite: false, last_played_at: 40 },
    { ...base, id: 3, last_played_at: null },
  ];
  expect(
    selectVideos(videos, '/favorites', '', '', 'newest', 'en').map(
      (video) => video.id,
    ),
  ).toEqual([3, 1]);
  expect(
    selectVideos(videos, '/history', '', '', 'played', 'en').map(
      (video) => video.id,
    ),
  ).toEqual([2, 1]);
  expect(selectVideos(videos, '/', 'ONE', '/a', 'played', 'en')).toHaveLength(
    3,
  );
  expect(selectVideos(videos, '/', '', '/b', 'played', 'en')).toHaveLength(0);
  expect(videos.map((video) => video.id)).toEqual([1, 2, 3]);
});
it('keeps page sorting separate while retaining filters and view', () => {
  useLibraryView.getState().setSearch('query');
  useLibraryView.getState().setList(true);
  useLibraryView.getState().setSort('/', 'name');
  useLibraryView.getState().setSort('/history', 'played');
  expect(useLibraryView.getState().search).toBe('query');
  expect(useLibraryView.getState().list).toBe(true);
  expect(useLibraryView.getState().sorts).toEqual({
    '/': 'name',
    '/history': 'played',
  });
});
