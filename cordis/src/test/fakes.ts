import type {
  ApiClient,
  Directory,
  Space,
  Video,
  VideoListQuery,
  VideoPage,
} from '../shared/api'
import type { ScanEvent, ScanEventSource } from '../shared/scanEvents'

/**
 * One record shaped exactly as `GET /api/videos` answers it. The numbers are
 * chosen so each sort has a different winner: `Video 01` is newest and largest,
 * `Video 02` was played most recently.
 */
export function makeVideo(index: number, overrides: Partial<Video> = {}): Video {
  const id = index + 1
  const name = `Video ${String(id).padStart(2, '0')}`
  return {
    id,
    path: `/media/${name}.mp4`,
    fileName: `${name}.mp4`,
    folderPath: '/media',
    fileSize: 1_000_000 * (30 - index),
    modifiedAt: 1_700_000_000_000 + index * 1000,
    durationMs: 60_000 + index * 1000,
    width: 1920,
    height: 1080,
    codec: 'h264',
    thumbnailPath: null,
    favorite: id % 2 === 1,
    playCount: id === 2 ? 5 : 0,
    lastPlayedAt: id === 2 ? 1_700_000_100_000 : null,
    createdAt: 1_700_000_000_000 + index * 1000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

export function makeVideos(count: number): Video[] {
  return Array.from({ length: count }, (_, index) => makeVideo(index))
}

export interface FakeApi extends ApiClient {
  readonly calls: VideoListQuery[]
  readonly favorites: Map<number, boolean>
  readonly played: number[]
}

interface FakeApiOptions {
  /** Thrown by `play`, standing in for an `unsupported` native envelope. */
  playFailure?: { code: string; message: string }
  videos?: Video[]
  spaces?: Space[]
  directories?: Directory[]
}

/** A small stand-in for the real adapter: filtering, sorting and paging happen
 *  here so a page test observes the same contract a real server gives it. */
export function makeFakeApi(options: FakeApiOptions = {}): FakeApi {
  const records = options.videos ?? makeVideos(30)
  const spaces = options.spaces ?? [{ id: 1, name: 'Library', current: true }]
  const directories = options.directories ?? []
  const calls: VideoListQuery[] = []
  const favorites = new Map(records.map((video) => [video.id, video.favorite]))
  const played: number[] = []

  return {
    calls,
    favorites,
    played,
    async listSpaces() {
      return spaces
    },
    async listDirectories() {
      return directories
    },
    async listVideos(query: VideoListQuery): Promise<VideoPage> {
      calls.push(query)
      const filtered = records
        .filter((video) => {
          if (query.only === 'favorites') return favorites.get(video.id) === true
          if (query.only === 'played') return video.playCount > 0
          return true
        })
        .sort((left, right) => {
          if (query.sort === 'name') return left.fileName.localeCompare(right.fileName)
          if (query.sort === 'size') return right.fileSize - left.fileSize
          if (query.sort === 'played') {
            return (right.lastPlayedAt ?? 0) - (left.lastPlayedAt ?? 0)
          }
          return right.createdAt - left.createdAt
        })
      return {
        videos: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
      }
    },
    async setFavorite(id, favorite) {
      favorites.set(id, favorite)
      const video = records.find((entry) => entry.id === id)!
      return { ...video, favorite }
    },
    async play(video) {
      if (options.playFailure) throw options.playFailure
      played.push(video.id)
      return video
    },
    async getSettings() {
      return {}
    },
    async putSettings(settings) {
      return settings
    },
    async native<T>() {
      return { ok: true, value: {} as T }
    },
  }
}

export interface FakeScanEvents {
  readonly source: ScanEventSource
  emit(event: ScanEvent): void
}

/** A scan event source whose emits the test decides, so WS wiring is observed
 *  without a socket. */
export function makeFakeScanEvents(): FakeScanEvents {
  const listeners = new Set<(event: ScanEvent) => void>()
  return {
    source: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    emit(event) {
      for (const listener of [...listeners]) listener(event)
    },
  }
}
