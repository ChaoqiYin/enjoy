import type {
  ApiClient,
  Directory,
  MediaToolDetection,
  NativeResult,
  PluginSummary,
  ScanControlAction,
  ScanPhase,
  ScanStatus,
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

export interface FakeNativeCall {
  command: string
  input: unknown
}

export interface FakeScanState {
  /** What `getScanStatus` answers; tests may change it before a reconnect. */
  status: ScanStatus
  statusCalls: number
  started: number[]
  rebuilt: number[]
  controls: { scanId: string; action: ScanControlAction }[]
}

export interface FakeApi extends ApiClient {
  readonly calls: VideoListQuery[]
  readonly favorites: Map<number, boolean>
  readonly played: number[]
  readonly nativeCalls: FakeNativeCall[]
  /** Ids whose detail was read through `getVideo`, in call order. */
  readonly detailReads: number[]
  readonly scan: FakeScanState
  /** Replace the records the listing reads, as a scan finishing would. */
  setVideos(videos: Video[]): void
}

interface FakeApiOptions {
  /** Thrown by `play`, standing in for an `unsupported` native envelope. */
  playFailure?: { code: string; message: string }
  videos?: Video[]
  spaces?: Space[]
  directories?: Directory[]
  /** Commands that answer with a native failure instead of success. */
  nativeFailures?: Record<string, { code: string; message: string }>
  /** The initial answer of `getScanStatus`; `{ active: false }` by default. */
  scanStatus?: ScanStatus
  /** What the plugin route reports; empty by default. */
  plugins?: PluginSummary[]
  /** What the media-tool route reports; both missing by default. */
  mediaTools?: MediaToolDetection
}

/** A small stand-in for the real adapter: filtering, sorting and paging happen
 *  here so a page test observes the same contract a real server gives it. */
export function makeFakeApi(options: FakeApiOptions = {}): FakeApi {
  let records = options.videos ?? makeVideos(30)
  const spaces = options.spaces ?? [{ id: 1, name: 'Library', current: true }]
  const directories = options.directories ?? []
  const calls: VideoListQuery[] = []
  const favorites = new Map(records.map((video) => [video.id, video.favorite]))
  const played: number[] = []
  const nativeCalls: FakeNativeCall[] = []
  const detailReads: number[] = []
  const scan: FakeScanState = {
    status: options.scanStatus ?? { active: false },
    statusCalls: 0,
    started: [],
    rebuilt: [],
    controls: [],
  }

  return {
    calls,
    favorites,
    played,
    nativeCalls,
    detailReads,
    scan,
    setVideos(videos) {
      records = videos
    },
    async listSpaces() {
      return spaces
    },
    async createSpace(name) {
      const space: Space = {
        id: Math.max(0, ...spaces.map((entry) => entry.id)) + 1,
        name,
        current: true,
      }
      for (const entry of spaces) entry.current = false
      spaces.push(space)
      return space
    },
    async renameSpace(id, name) {
      const space = spaces.find((entry) => entry.id === id)!
      space.name = name
      return { ...space }
    },
    async deleteSpace(id) {
      const index = spaces.findIndex((entry) => entry.id === id)
      spaces.splice(index, 1)
      return spaces.find((entry) => entry.current) ?? spaces[0]!
    },
    async switchSpace(id) {
      for (const entry of spaces) entry.current = entry.id === id
      return spaces.find((entry) => entry.id === id)!
    },
    async listDirectories() {
      return directories
    },
    async addDirectory(spaceId, path) {
      const directory: Directory = {
        id: Math.max(0, ...directories.map((entry) => entry.id)) + 1,
        spaceId,
        path,
      }
      directories.push(directory)
      return directory
    },
    async removeDirectory(id) {
      const index = directories.findIndex((entry) => entry.id === id)
      return directories.splice(index, 1)[0]!
    },
    async getScanStatus() {
      scan.statusCalls += 1
      return scan.status
    },
    async startScan(spaceId) {
      scan.started.push(spaceId)
      return { scanId: 'scan-1' }
    },
    async rebuildThumbnails(spaceId) {
      scan.rebuilt.push(spaceId)
      return { scanId: 'thumbs-1' }
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
    async getVideo(id) {
      detailReads.push(id)
      const video = records.find((entry) => entry.id === id)
      if (video === undefined) {
        throw { code: 'video.not_found', message: 'Video does not exist' }
      }
      return { ...video, favorite: favorites.get(id) ?? video.favorite }
    },
    async listPlugins() {
      return options.plugins ?? []
    },
    async getMediaTools() {
      return options.mediaTools ?? { ffmpeg: null, ffprobe: null }
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
    async controlScan(scanId, action) {
      scan.controls.push({ scanId, action })
      return action === 'pause' ? 'paused' : action === 'resume' ? 'discovering' : 'cancelled'
    },
    async getSettings() {
      return {}
    },
    async putSettings(settings) {
      return settings
    },
    async native<T>(command: string, input: unknown) {
      nativeCalls.push({ command, input })
      const failure = options.nativeFailures?.[command]
      if (failure) {
        return { ok: false, code: failure.code, message: failure.message } as NativeResult<T>
      }
      return { ok: true, value: {} as T }
    },
    openExternal() {},
  }
}

export interface FakeScanEvents {
  readonly source: ScanEventSource
  emit(event: ScanEvent): void
  /** Pretend the socket opened; `reconnected` matches the real source's flag. */
  connect(reconnected?: boolean): void
}

/** A scan event source whose emits the test decides, so WS wiring is observed
 *  without a socket. */
export function makeFakeScanEvents(): FakeScanEvents {
  const listeners = new Map<
    (event: ScanEvent) => void,
    { onConnect?: (reconnected: boolean) => void } | undefined
  >()
  let connections = 0
  return {
    source: {
      subscribe(listener, options) {
        listeners.set(listener, options)
        return () => listeners.delete(listener)
      },
    },
    emit(event) {
      for (const listener of [...listeners.keys()]) listener(event)
    },
    connect(reconnected = connections > 0) {
      if (!reconnected) connections = 0
      for (const options of listeners.values()) options?.onConnect?.(reconnected)
      connections += 1
    },
  }
}
