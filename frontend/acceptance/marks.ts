import { videos } from './records';
import * as covers from './covers';
import type { Video } from '../src/shared/api';

/**
 * The two marks a space can put on a record, and the record as the space that
 * was asked holds it.
 *
 * Every space holds the same files, because that is what spaces are: the same
 * path is a different record in each of them (ADR 0011). What a space keeps for
 * itself is which of them the user marked, and it keeps two marks — a favorite
 * and an entry on the 共享清单. Both are held the same way, keyed by the space id
 * the command carried rather than by the one this copy thinks the interface is
 * on: answering the wrong space is the mistake this harness exists to make
 * visible, and it cannot make it visible while it corrects for it.
 *
 * Here rather than in the fixture's switch because it is one state with four
 * readers — the listing, the two mark commands, and the 共享清单 a service is
 * started over — and `web-fixture.ts` is at the length its module keeps. The
 * same reason `fields.ts` and `plugins.ts` are files.
 */

/**
 * A space starts with a stretch of the library marked, thirty records long and
 * shifted per mark, because 收藏, 最近播放 and 共享 are pages of this same
 * collection asked three ways (ADR 0016): a listing holding one record can be
 * shown in one shape and never turned to a second page, and three listings
 * holding the same records would be three readings of one page rather than three
 * pages a walkthrough can tell apart. Six records are left out of each, so a mark
 * is visibly a mark rather than the library.
 */
const marked = (first: number) =>
  Array.from({ length: 30 }, (_, step) => first + step);
const marks = new Map<string, Set<number>>([
  ['favorite:1', new Set(marked(7))],
  ['shared:1', new Set(marked(4))],
]);

/** The two marks a space can put on a record, named by the field the command
 *  carries them in, so one handler can serve both. */
export type Marker = 'favorite' | 'shared';

/** The records one space has marked, read out of the map that holds them. */
export function markedOf(kind: Marker, spaceId: number): Set<number> {
  const key = `${kind}:${spaceId}`;
  const held = marks.get(key) ?? new Set<number>();
  marks.set(key, held);
  return held;
}

/** One record as the space being asked holds it: the files, its own marks, and
 *  the cover a plugin has found for it. */
export function recordsOf(spaceId: number | undefined): Video[] {
  const favorites = markedOf('favorite', Number(spaceId));
  const shared = markedOf('shared', Number(spaceId));
  return videos.map((video) => ({
    ...video,
    favorite: favorites.has(video.id),
    shared: shared.has(video.id),
    cover_path: covers.coverOf(video.path),
  }));
}

/** One space's 共享清单, in the order the backend would serve it. */
export function sharedIds(spaceId: number): number[] {
  return [...markedOf('shared', spaceId)].sort((left, right) => left - right);
}

/** Puts one mark on one record, or takes it off. */
export function markOn(kind: Marker, payload: Record<string, unknown>): void {
  const video = videos.find((video) => video.path === payload.path);
  if (!video) return;
  const held = markedOf(kind, Number(payload.spaceId));
  if (Boolean(payload[kind])) held.add(video.id);
  else held.delete(video.id);
  // Nothing is recorded here about the service being out of step: a share mark
  // moved while one is running is noticed by the status comparing the list
  // against the snapshot it read, which is how the backend notices it too.
}
