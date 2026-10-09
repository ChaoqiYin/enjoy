import { expect, it } from 'vitest';
import { defaultSort, listingAt, listingQuery } from './listing';
import type { Listing } from './listing';

const space = 7;
const untouched = { search: '', folder: '', sort: 'newest' } as const;

it('names each listing by the condition that makes it that listing', () => {
  // The four pages are one collection asked for four ways. Which records a page
  // holds is the backend's answer now: with one page in hand, "the favorites"
  // is not a fact the interface can work out for itself (ADR 0016).
  const only = (listing: Listing) =>
    listingQuery(listing, space, untouched).only;
  expect(only('/favorites')).toBe('favorite');
  expect(only('/history')).toBe('played');
  expect(only('/share')).toBe('shared');
  // 视频库 is the whole space, and a condition that says "everything" is not a
  // condition: nothing is asked for, rather than being asked for by name.
  expect(only('/')).toBeUndefined();
});

it('orders by the word the user chose, and leaves the direction to the backend', () => {
  const sorted = (sort: 'newest' | 'played' | 'name') =>
    listingQuery('/', space, { ...untouched, sort });
  // 最近添加 is the backend's `added`; the interface names the order and not a
  // direction, because how each order is usually read is already fixed
  // (ADR 0016).
  expect(sorted('newest').sort).toBe('added');
  expect(sorted('played').sort).toBe('played');
  expect(sorted('name').sort).toBe('name');
  expect(sorted('newest').direction).toBeUndefined();
});

it('narrows by what was typed, and an empty box narrows nothing', () => {
  const typed = listingQuery('/', space, {
    ...untouched,
    search: 'holiday',
    folder: '/movies',
  });
  expect(typed.search).toBe('holiday');
  expect(typed.folder).toBe('/movies');
  // An empty box is not a search for nothing; it is no search, and the two are
  // different questions to ask of the backend.
  const empty = listingQuery('/', space, untouched);
  expect(empty.search).toBeUndefined();
  expect(empty.folder).toBeUndefined();
});

it('asks for the listing of the space it is being read in', () => {
  // ADR 0011: a page is a page of one space. Every question carries it, so a
  // query can never be answered out of the wrong library.
  expect(listingQuery('/', space, untouched).spaceId).toBe(space);
});

it('says which routes are a listing, and how each is read by default', () => {
  expect(listingAt('/')).toBe('/');
  expect(listingAt('/favorites')).toBe('/favorites');
  expect(listingAt('/history')).toBe('/history');
  expect(listingAt('/share')).toBe('/share');
  // 设置页 reads no listing, and saying so is what lets it ask for none.
  expect(listingAt('/settings')).toBeNull();
  // 最近播放页 is about what has been played, so it is read in that order until
  // the user says otherwise; the other three start from what is newest.
  expect(defaultSort('/history')).toBe('played');
  expect(defaultSort('/')).toBe('newest');
  expect(defaultSort('/favorites')).toBe('newest');
  expect(defaultSort('/share')).toBe('newest');
});
