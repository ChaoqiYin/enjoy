import { useCallback, useEffect, useRef, useState } from 'react'
import {
  normalizeError,
  type ApiError,
  type Video,
  type VideoFilter,
  type VideoPage,
  type VideoSort,
} from '../../shared/api'
import { useServices } from '../../shared/services'
import {
  DEFAULT_VIEW_MODE,
  PAGE_SIZE,
  defaultSort,
  effectiveFilter,
  type Listing,
  type ViewMode,
} from './listing'

export interface PlayFailure {
  code: string
  message: string
  path: string
}

export interface VideoListingState {
  listing: Listing
  videos: Video[]
  total: number
  loading: boolean
  error: ApiError | null
  playFailure: PlayFailure | null
  viewMode: ViewMode
  sort: VideoSort
  filter: VideoFilter
  page: number
  setViewMode: (value: ViewMode) => void
  setSort: (value: VideoSort) => void
  setFilter: (value: VideoFilter) => void
  turnTo: (page: number) => void
  toggleFavorite: (video: Video) => Promise<void>
  play: (video: Video) => Promise<void>
  retry: () => void
  dismissError: () => void
  dismissPlayFailure: () => void
}

/**
 * One listing page's state: which space, which page of the collection, how the
 * user wants it read, and the two actions the records offer.
 *
 * Filtering, ordering and paging are the backend's because the backend counts
 * the whole collection; this hook only says what to ask and keeps the answer.
 * It depends on `Services` rather than a concrete client so tests can hand it a
 * fake and observe the queries exactly as the server would.
 */
export function useVideoListing(listing: Listing): VideoListingState {
  const { api, scanEvents } = useServices()
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [spaceLoaded, setSpaceLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE)
  const [sort, setSortState] = useState<VideoSort>(() => defaultSort(listing))
  const [filter, setFilterState] = useState<VideoFilter>('all')
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<VideoPage | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [playFailure, setPlayFailure] = useState<PlayFailure | null>(null)
  const [revision, setRevision] = useState(0)
  const [spaceRevision, setSpaceRevision] = useState(0)
  const requestId = useRef(0)

  const activeFilter = effectiveFilter(listing, filter)

  useEffect(() => {
    let alive = true
    setError(null)
    api
      .listSpaces()
      .then((spaces) => {
        if (!alive) return
        const current = spaces.find((space) => space.current) ?? spaces[0]
        setSpaceId(current?.id ?? null)
        setSpaceLoaded(true)
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setSpaceLoaded(true)
        setListLoading(false)
        setError(normalizeError(reason))
      })
    return () => {
      alive = false
    }
  }, [api, spaceRevision])

  useEffect(() => {
    if (spaceId === null) return
    const sequence = requestId.current + 1
    requestId.current = sequence
    setListLoading(true)
    api
      .listVideos({
        spaceId,
        only: activeFilter,
        sort,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      .then((data) => {
        if (sequence !== requestId.current) return
        setPageData(data)
        setListLoading(false)
      })
      .catch((reason: unknown) => {
        if (sequence !== requestId.current) return
        setListLoading(false)
        setError(normalizeError(reason))
      })
  }, [api, spaceId, activeFilter, sort, page, revision])

  // A rescan can shorten the list under the reader; a page past the end has no
  // records and no footer to leave by, so step back to the last real page.
  useEffect(() => {
    if (pageData === null) return
    const last = Math.max(0, Math.ceil(pageData.total / PAGE_SIZE) - 1)
    if (page > last) setPage(last)
  }, [pageData, page])

  // The scan dialog is out of scope, but this page still has to notice that the
  // collection changed. Terminal phases are the only moment the records settle.
  useEffect(() => {
    if (spaceId === null) return
    return scanEvents.subscribe((event) => {
      if (event.spaceId !== spaceId) return
      if (event.phase === 'done' || event.phase === 'cancelled') {
        setRevision((value) => value + 1)
      }
    })
  }, [scanEvents, spaceId])

  const applyVideo = useCallback((updated: Video) => {
    setPageData((current) =>
      current === null
        ? current
        : {
            ...current,
            videos: current.videos.map((video) =>
              video.id === updated.id ? updated : video,
            ),
          },
    )
  }, [])

  const setViewModeValue = useCallback((value: ViewMode) => {
    setViewMode(value)
  }, [])

  const setSort = useCallback((value: VideoSort) => {
    setPlayFailure(null)
    setSortState(value)
    setPage(0)
  }, [])

  const setFilter = useCallback((value: VideoFilter) => {
    setPlayFailure(null)
    setFilterState(value)
    setPage(0)
  }, [])

  const turnTo = useCallback((next: number) => {
    setPlayFailure(null)
    setPage(Math.max(0, next))
  }, [])

  const toggleFavorite = useCallback(
    async (video: Video) => {
      try {
        const updated = await api.setFavorite(video.id, !video.favorite)
        applyVideo(updated)
        // Under a favorites-only listing an unfavorited record no longer belongs
        // to the collection, so the page has to be read again to drop it.
        if (!updated.favorite && activeFilter === 'favorites') {
          setRevision((value) => value + 1)
        }
      } catch (reason) {
        setError(normalizeError(reason))
      }
    },
    [api, activeFilter, applyVideo],
  )

  const play = useCallback(
    async (video: Video) => {
      setPlayFailure(null)
      try {
        const updated = await api.play(video)
        applyVideo(updated)
        setRevision((value) => value + 1)
      } catch (reason) {
        const normalized = normalizeError(reason)
        setPlayFailure({
          code: normalized.code,
          message: normalized.message,
          path: video.path,
        })
      }
    },
    [api, applyVideo],
  )

  const retry = useCallback(() => {
    setError(null)
    setListLoading(true)
    setRevision((value) => value + 1)
    setSpaceRevision((value) => value + 1)
  }, [])

  const dismissError = useCallback(() => setError(null), [])
  const dismissPlayFailure = useCallback(() => setPlayFailure(null), [])

  const loading =
    error === null && (spaceId === null ? !spaceLoaded : listLoading)

  return {
    listing,
    videos: pageData?.videos ?? [],
    total: pageData?.total ?? 0,
    loading,
    error,
    playFailure,
    viewMode,
    sort,
    filter: activeFilter,
    page,
    setViewMode: setViewModeValue,
    setSort,
    setFilter,
    turnTo,
    toggleFavorite,
    play,
    retry,
    dismissError,
    dismissPlayFailure,
  }
}
