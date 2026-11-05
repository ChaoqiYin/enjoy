import type {
  ApiClient,
  ApiError,
  Directory,
  MediaToolDetection,
  NativeResult,
  PluginSummary,
  ScanControlAction,
  ScanPhase,
  ScanStatus,
  ShareStatus,
  Space,
  Video,
  VideoListQuery,
  VideoPage,
} from '../src/shared/api'
import type { ScanEvent, ScanEventSource } from '../src/shared/scanEvents'

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
    shared: false,
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

/** A share status with the two addresses the server would usually report. */
/** A share status with the address a server would usually report. */
export function makeShareStatus(overrides: Partial<ShareStatus> = {}): ShareStatus {
  return {
    running: false,
    port: null,
    username: 'enjoy',
    password: '1234',
    needsRestart: false,
    listChanged: false,
    pendingChanges: { added: [], removed: [] },
    missingFiles: 0,
    devices: [],
    addresses: ['192.168.1.5'],
    ...overrides,
  }
}

export type ShareOperation = 'status' | 'open' | 'restart' | 'close' | 'password'

export interface FakeShareState {
  /** What the next status read answers; tests may change it between polls. */
  status: ShareStatus
  statusCalls: number
  opened: number
  restarted: number
  closed: number
  regenerated: number
  /** Thrown by the next call of that operation, then cleared. */
  failNext: Partial<Record<ShareOperation, ApiError>>
  setStatus(next: Partial<ShareStatus>): void
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
  readonly shared: Map<number, boolean>
  readonly played: number[]
  readonly nativeCalls: FakeNativeCall[]
  /** Ids whose detail was read through `getVideo`, in call order. */
  readonly detailReads: number[]
  readonly scan: FakeScanState
  readonly share: FakeShareState
  /** Replace the records the listing reads, as a scan finishing would. */
  setVideos(videos: Video[]): void
}

interface FakeApiOptions {
  /** Thrown by `play`, standing in for an `unsupported` native envelope. */
  playFailure?: { code: string; message: string }
  /** Thrown by `setShared`, so the page's failure path can be observed. */
  shareFailure?: { code: string; message: string }
  videos?: Video[]
  spaces?: Space[]
  directories?: Directory[]
  /** Commands that answer with a native failure instead of success. */
  nativeFailures?: Record<string, { code: string; message: string }>
  /** Thrown by `listVideos`, so a page's listing failure can be observed. */
  listFailure?: { code: string; message: string }
  /** The initial answer of `getScanStatus`; `{ active: false }` by default. */
  scanStatus?: ScanStatus
  /** What `GET /api/share/status` answers before any command is applied. */
  shareStatus?: Partial<ShareStatus>
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
  const shared = new Map(records.map((video) => [video.id, video.shared]))
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
  const share: FakeShareState = {
    status: makeShareStatus(options.shareStatus),
    statusCalls: 0,
    opened: 0,
    restarted: 0,
    closed: 0,
    regenerated: 0,
    failNext: {},
    setStatus(next) {
      share.status = { ...share.status, ...next }
    },
  }

  /** A pending failure is thrown once, as a server that answers wrong once would. */
  const failIfAsked = (operation: ShareOperation): void => {
    const failure = share.failNext[operation]
    if (failure === undefined) return
    delete share.failNext[operation]
    throw failure
  }

  /** Arrays are copied so a poll cannot mutate the state the next poll reads. */
  const shareAnswer = (): ShareStatus => ({
    ...share.status,
    devices: share.status.devices.map((device) => ({ ...device })),
    addresses: [...share.status.addresses],
  })

  return {
    calls,
    favorites,
    shared,
    played,
    nativeCalls,
    detailReads,
    scan,
    share,
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
      if (options.listFailure) throw options.listFailure
      const needle = query.search.toLowerCase()
      const filtered = records
        .filter((video) => {
          if (query.only === 'favorites') return favorites.get(video.id) === true
          if (query.only === 'shared') return shared.get(video.id) === true
          if (query.only === 'played') return video.playCount > 0
          return true
        })
        .filter(
          (video) =>
            needle === '' || video.fileName.toLowerCase().includes(needle),
        )
        .filter(
          (video) => query.folder === '' || video.folderPath === query.folder,
        )
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
      return {
        ...video,
        favorite: favorites.get(id) ?? video.favorite,
        shared: shared.get(id) ?? video.shared,
      }
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
    async setShared(id, value) {
      if (options.shareFailure) throw options.shareFailure
      shared.set(id, value)
      return value
    },
    async getShareStatus() {
      share.statusCalls += 1
      failIfAsked('status')
      return shareAnswer()
    },
    async openShare() {
      share.opened += 1
      failIfAsked('open')
      share.status = {
        ...share.status,
        running: true,
        port: share.status.port ?? 4918,
        devices: [],
        missingFiles: 0,
        listChanged: false,
        pendingChanges: { added: [], removed: [] },
        needsRestart: false,
      }
      return shareAnswer()
    },
    async restartShare() {
      share.restarted += 1
      failIfAsked('restart')
      // A restart applies the list and the password the status already holds:
      // the service is running on the same port with nothing left pending.
      share.status = {
        ...share.status,
        running: true,
        port: share.status.port ?? 4918,
        devices: [],
        missingFiles: 0,
        listChanged: false,
        pendingChanges: { added: [], removed: [] },
        needsRestart: false,
      }
      return shareAnswer()
    },
    async closeShare() {
      share.closed += 1
      failIfAsked('close')
      share.status = {
        ...share.status,
        running: false,
        port: null,
        devices: [],
        missingFiles: 0,
        listChanged: false,
        pendingChanges: { added: [], removed: [] },
        needsRestart: false,
      }
      return shareAnswer()
    },
    async resetSharePassword() {
      share.regenerated += 1
      failIfAsked('password')
      share.status = {
        ...share.status,
        password: share.status.password === '1234' ? '5678' : '1234',
        needsRestart: share.status.running,
      }
      return shareAnswer()
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
    async openExternal() {},
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
