import type { Video } from '../src/shared/api';

/**
 * The files every space holds, which is what spaces are: the same path is a
 * different record in each of them (ADR 0011). A record's own facts are the same
 * everywhere — its name, its size, the folder it was filed under — and what a
 * space keeps for itself is which of them the user marked.
 *
 * Thirty-six of them, so that a listing is longer than one page and a walkthrough
 * can be shown reading the second one. Two folders, because the folder control is
 * on every listing page and a list of one folder would make it look like a no-op.
 *
 * Thirty of them have been played and the six newest have not, because 最近播放 is
 * one of the four listings and a page of it that is always empty is a page whose
 * three shapes and whose pager no walkthrough can reach. When each one was played
 * is not when it was added: the order 最近播放 opens on is the playing order, and a
 * list that read the same as 视频库 would be the order nobody had checked.
 */
export const videos: Video[] = Array.from({ length: 36 }, (_, index) => ({
  id: index + 1,
  path: `/acceptance/${index % 2 ? 'Archive' : 'Movies'}/video-${String(index + 1).padStart(2, '0')}.mp4`,
  file_name: `video-${String(index + 1).padStart(2, '0')}.mp4`,
  folder_path: `/acceptance/${index % 2 ? 'Archive' : 'Movies'}`,
  file_size: 8100 + index * 1000,
  modified_at: 1720000000000 + index,
  duration_ms: 65000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  thumbnail_path: null,
  favorite: index === 0,
  shared: false,
  play_count: index < 30 ? 1 : 0,
  // The oldest record was played last, so that the order 最近播放 reads in is
  // visibly its own and not the library's read again.
  last_played_at: index < 30 ? 1721000000000 + (29 - index) : null,
  created_at: 1720000000000 + index,
  updated_at: 1720000000000 + index,
}));
