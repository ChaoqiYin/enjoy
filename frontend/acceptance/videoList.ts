import type { Video, VideoPage, VideoQuery } from '../src/shared/api';

/**
 * The `list_videos` command as this stand-in backend answers it: one page of the
 * records a question matches, and how many the question holds.
 *
 * It is a module of its own because it is the one place in the fixture that
 * computes rather than recalls — the rest of it hands back what a walkthrough put
 * there — and because the fixture file is read for what a walkthrough is shown
 * (see the limit in `check-source.mjs`).
 *
 * The rules here are the backend's, read off `Repository::list` and the clauses
 * beside it, and they are read the same way: a name matched anywhere in it
 * (SQLite's LIKE is case-insensitive), one folder by its exact path, one of the
 * three marks a listing can be narrowed to, and played read from the count rather
 * than from the last time — a record that was played is one with a history,
 * however long ago. What a walkthrough needs from this command is a list that
 * behaves; what the rules are is held by the backend's own tests.
 */
export function videoPage(records: Video[], query: VideoQuery): VideoPage {
  const matched = records
    .filter((video) => matches(video, query))
    .sort(byQuery(query));
  // The count describes the whole list and the page is cut out of it, in that
  // order: the one thing a page cannot answer is how many there are. Both bounds
  // are clamped the way the backend clamps them — a negative limit is the whole
  // list to the query language, not an empty page.
  const offset = Math.max(0, query.offset);
  const limit = Math.max(0, query.limit);
  return {
    items: matched.slice(offset, offset + limit),
    total: matched.length,
  };
}

function matches(video: Video, query: VideoQuery): boolean {
  if (
    query.search &&
    !video.file_name.toLowerCase().includes(query.search.toLowerCase())
  )
    return false;
  if (query.folder && video.folder_path !== query.folder) return false;
  if (query.only === 'favorite' && !video.favorite) return false;
  if (query.only === 'shared' && !video.shared) return false;
  if (query.only === 'played' && video.play_count === 0) return false;
  return true;
}

/**
 * The order a query is read in, in the terms the backend reads it in (ADR 0016):
 * one column per sort, the direction the query names or the one that column is
 * usually read in, and `id` as the tie-break in the same direction — which is
 * what makes the order total, and so what lets one page follow another without
 * dropping or repeating a record.
 *
 * A never-played record sorts as the null it is, which SQLite puts last under a
 * descending order: 最近播放 reads the played ones first and the rest after them,
 * rather than leaving them out.
 */
function byQuery(query: VideoQuery): (left: Video, right: Video) => number {
  const column: Record<
    string,
    'created_at' | 'last_played_at' | 'file_name' | 'file_size'
  > = {
    added: 'created_at',
    played: 'last_played_at',
    name: 'file_name',
    size: 'file_size',
  };
  const usual: Record<string, 'asc' | 'desc'> = {
    added: 'desc',
    played: 'desc',
    name: 'asc',
    size: 'desc',
  };
  const field = column[query.sort ?? 'added'];
  const way =
    (query.direction ?? usual[query.sort ?? 'added']) === 'asc' ? 1 : -1;
  return (left, right) => {
    const one = left[field];
    const other = right[field];
    if (one !== other) {
      if (one === null) return 1;
      if (other === null) return -1;
      return (one < other ? -1 : 1) * way;
    }
    return (left.id - right.id) * way;
  };
}
