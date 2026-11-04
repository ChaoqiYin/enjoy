import type { VideoFilter, VideoSort } from '../../shared/api'

/** The two listings this build draws. */
export type Listing = 'library' | 'favorites'

export type ViewMode = 'grid' | 'list' | 'table'

/** Orders offered by the toolbar, in the order it offers them. */
export const SORT_ORDERS: readonly VideoSort[] = ['newest', 'played', 'name', 'size']

/**
 * What each order is called in the language pack.
 *
 * The labels are the old interface's keys, so the dropdown says what the
 * previous build said: 最近添加 is the order's name rather than the backend's
 * `newest`, and 最近播放 borrows the 最近播放页's own word.
 */
export const SORT_ORDER_LABELS: Record<VideoSort, string> = {
  newest: 'newest',
  played: 'history',
  name: 'filename',
  size: 'fileVolume',
}

/** Filters offered by the library toolbar. Favorites fixes its own. */
export const FILTERS: readonly VideoFilter[] = ['all', 'favorites', 'played']

/** Shapes offered by the view switch; grid is what every page opens in. */
export const VIEW_MODES: readonly ViewMode[] = ['grid', 'list', 'table']

/** One page of records, fixed by the product so the pager and requests agree. */
export const PAGE_SIZE = 24

export const DEFAULT_VIEW_MODE: ViewMode = 'grid'

/** Both listings open in this order; the control starts here too. */
export const DEFAULT_SORT: VideoSort = 'newest'

/**
 * The filter a page actually asks for: favorites cannot be narrowed, so the
 * control state is ignored there rather than painted as if it mattered.
 */
export function effectiveFilter(
  listing: Listing,
  filter: VideoFilter,
): VideoFilter {
  return listing === 'favorites' ? 'favorites' : filter
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}
