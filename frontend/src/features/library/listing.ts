import type { VideoQuery } from '../../shared/api';

/**
 * 一张列表：界面要读的那一份记录，和读它时问出的那个问题。
 *
 * The four pages of the library — 视频库, 收藏, 最近播放, 共享 — are one collection
 * asked for four ways, and since the backend answers with one page at a time,
 * the difference between them can no longer be applied where the page is drawn
 * (`_8` 的底栏、ADR 0016): a search run over the page in hand answers about that
 * page, and the favorites are not something the records on one page can say. So
 * each page states who it is, and that statement travels.
 *
 * What is here is the translation and nothing else: the interface's words for a
 * listing turned into the query the backend accepts, with no state and no
 * fetching, so that the four things a page can be — and the order each is read
 * in by default — are readable and testable on their own.
 */

/** A route that reads a listing. 设置页 is not one. */
export type Listing = '/' | '/favorites' | '/history' | '/share';

/**
 * How a list is read, in the user's words. Not the backend's `added`: the
 * interface's word is 最近添加 because that is what the control says, and the
 * translation belongs with the other one, here.
 */
export type SortOrder = 'newest' | 'played' | 'name';

/**
 * How many records one request carries.
 *
 * One number, not a control: 组件清单 §8.1 fixes it at 24 and asks for no size
 * selector. It is also what the pager counts pages with, so the two cannot
 * disagree about how many pages there are.
 */
export const PAGE_SIZE = 24;

/** What narrows a listing and how it is ordered, as the interface holds it. */
export type ListingView = {
  search: string;
  folder: string;
  sort: SortOrder;
};

/**
 * Which listing a route is, or null for a route that reads none.
 *
 * The route is the answer rather than an argument each page passes: every page
 * already declares its own path in the router, and a page that named its
 * listing a second time could name one that is not the page it is drawn at.
 */
export function listingAt(pathname: string): Listing | null {
  return pathname === '/' ||
    pathname === '/favorites' ||
    pathname === '/history' ||
    pathname === '/share'
    ? pathname
    : null;
}

/**
 * The order a listing is read in until the user says otherwise.
 *
 * 最近播放页 is about what has been played, so it opens on what was played last;
 * everything else opens on what was added last. This is the same default the
 * backend falls back to for the order, named here because it is the page's
 * opening state rather than the backend's.
 */
export function defaultSort(listing: Listing): SortOrder {
  return listing === '/history' ? 'played' : 'newest';
}

/**
 * The description of the listing, without which page of it is being read.
 *
 * The whole description travels, so this is the identity of the collection: two
 * requests that agree here are two pages of the same list, which is what both
 * the cache key and "the list the user is reading" are built from. Paging is
 * added on top of it rather than being part of it — see `useLibrary`, which is
 * the one place that decides which page that is.
 *
 * The three directions are left out deliberately: the interface names the order,
 * and how each order is usually read — newest first, most recently played first,
 * a file name from A — is fixed, so asking for a direction would be asking for
 * what it already gets (ADR 0016).
 */
export function listingQuery(
  listing: Listing,
  spaceId: number,
  view: ListingView,
): Omit<VideoQuery, 'offset' | 'limit'> {
  return {
    spaceId,
    // A box nobody has typed in is no search, not a search for nothing.
    search: view.search || undefined,
    folder: view.folder || undefined,
    only:
      listing === '/favorites'
        ? 'favorite'
        : listing === '/history'
          ? 'played'
          : listing === '/share'
            ? 'shared'
            : undefined,
    sort:
      view.sort === 'newest'
        ? 'added'
        : view.sort === 'played'
          ? 'played'
          : 'name',
  };
}
