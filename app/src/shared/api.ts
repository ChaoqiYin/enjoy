/**
 * The HTTP seam the pages talk to.
 *
 * Everything below `/api` is reached through this one interface: the real
 * implementation wraps the framework's token-injecting HTTP client, and tests
 * hand the pages a fake with the same shape. Errors always cross this seam as
 * `{ code, message }`, whichever side produced them.
 */

import { bootstrapToken } from 'cordis-app/client'

export type VideoFilter = 'all' | 'favorites' | 'played' | 'shared'
export type VideoSort = 'newest' | 'played' | 'name' | 'size'

export interface Space {
  id: number
  name: string
  current: boolean
}

export interface Directory {
  id: number
  spaceId: number
  path: string
}

export interface Video {
  id: number
  path: string
  fileName: string
  folderPath: string
  fileSize: number
  modifiedAt: number
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
  thumbnailPath: string | null
  favorite: boolean
  shared: boolean
  playCount: number
  lastPlayedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface VideoPage {
  videos: Video[]
  total: number
}

/** One client heard from in the last minute, as the status route reports it. */
export interface ShareDevice {
  /** What the client called itself; the empty string when it did not say. */
  name: string
  address: string
  /** Milliseconds since the epoch. */
  lastSeenAt: number
}

/** One IPv4 address the share service can be reached at. */
export interface ShareAddress {
  address: string
  /** Whether the address only reaches this machine. */
  loopback: boolean
}

/** `GET /api/share/status`, and what every share command answers with. */
export interface ShareStatus {
  running: boolean
  /** The port actually taken; null while the service is not running. */
  port: number | null
  username: string
  password: string
  /** The stored password was replaced after the running service copied it. */
  needsRestart: boolean
  /** The shared list no longer matches the snapshot the service serves. */
  listChanged: boolean
  /** Videos in the snapshot whose file is gone; zero unless running. */
  missingFiles: number
  /** Most recently heard from first; empty unless running. */
  devices: ShareDevice[]
  /** Every address the service can be reached at, most useful first. */
  addresses: ShareAddress[]
}

/** One entry of the read-only plugin catalogue the server reports. */
export interface PluginSummary {
  id: string
  name: string
  version?: string
}

/** `GET /api/media/tools`: where the scan's two external programs were found. */
export interface MediaToolDetection {
  ffmpeg: string | null
  ffprobe: string | null
}

export interface VideoListQuery {
  spaceId: number
  only: VideoFilter
  sort: VideoSort
  /** A file name to look for; the empty string reads the whole listing. */
  search: string
  /** A folder to narrow the listing to; the empty string reads all of them. */
  folder: string
  offset: number
  limit: number
}

/**
 * The address of one video's cached JPEG; the scan writes it, this route serves
 * it.
 *
 * An `<img>` cannot carry the `Authorization` header the HTTP seam sends, so
 * the token rides in the query instead — the server accepts either. It is read
 * once: the token the page bootstrapped with does not change while it is open.
 */
export function thumbnailUrl(videoId: number): string {
  mediaToken ??= bootstrapToken()
  const query =
    mediaToken === '' ? '' : `?token=${encodeURIComponent(mediaToken)}`
  return `/api/thumbnails/${videoId}${query}`
}

let mediaToken: string | null = null

export type ScanPhase =
  | 'discovering'
  | 'indexing'
  | 'metadata'
  | 'thumbnails'
  | 'paused'
  | 'done'
  | 'cancelled'
  | 'failed'

export type ScanControlAction = 'pause' | 'resume' | 'cancel'

export interface ScanChanges {
  added: number
  updated: number
  removed: number
}

/** One progress snapshot, shared by the WS message and the status endpoint. */
export interface ScanProgress {
  scanId: string
  spaceId: number
  phase: ScanPhase
  changes: ScanChanges
  failures: number
  unreachableDirectories: number
  discovered: number
  processed: number
  indexed: number
  metadataReady: number
  thumbnailsReady: number
  currentPath: string
}

/** `GET /api/scan/status`; `active` says whether the scan slot is occupied. */
export interface ScanStatus extends Partial<Omit<ScanProgress, 'scanId'>> {
  active: boolean
  scanId?: string
}

export type NativeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string }

export interface ApiError {
  code: string
  message: string
}

export interface ApiClient {
  listSpaces(): Promise<Space[]>
  createSpace(name: string): Promise<Space>
  renameSpace(id: number, name: string): Promise<Space>
  deleteSpace(id: number): Promise<Space>
  switchSpace(id: number): Promise<Space>
  listDirectories(spaceId?: number): Promise<Directory[]>
  addDirectory(spaceId: number, path: string): Promise<Directory>
  removeDirectory(id: number): Promise<Directory>
  getScanStatus(spaceId?: number): Promise<ScanStatus>
  startScan(spaceId: number): Promise<{ scanId: string }>
  rebuildThumbnails(spaceId: number): Promise<{ scanId: string }>
  listVideos(query: VideoListQuery): Promise<VideoPage>
  /** One record, for the detail dialog that a card opens. */
  getVideo(id: number): Promise<Video>
  /** The catalogue the plugins route reports; empty in this version. */
  listPlugins(): Promise<PluginSummary[]>
  /** Whether the media phases will have ffmpeg and ffprobe to run. */
  getMediaTools(): Promise<MediaToolDetection>
  setFavorite(id: number, favorite: boolean): Promise<Video>
  /** The shared flag the server stored. The shared route answers that flag
   *  rather than the whole record, unlike the favorite route beside it. */
  setShared(id: number, shared: boolean): Promise<boolean>
  /** Whether the service is running, and everything a client needs to reach it. */
  getShareStatus(): Promise<ShareStatus>
  /** Start the service over the current space's shared list. */
  openShare(): Promise<ShareStatus>
  /** Stop the service; answering when it is already stopped is not a failure. */
  closeShare(): Promise<ShareStatus>
  /** Draw a new password; a running service keeps the old one until restarted. */
  resetSharePassword(): Promise<ShareStatus>
  /** Open the file with the system player and record the play. */
  play(video: Video): Promise<Video>
  /** Pause, resume or cancel one scan; answers with the phase it settled on. */
  controlScan(scanId: string, action: ScanControlAction): Promise<ScanPhase>
  getSettings(): Promise<Record<string, unknown>>
  putSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>>
  native<T = unknown>(command: string, input: unknown): Promise<NativeResult<T>>
  /** Hand a URL to the user's browser rather than navigating this window. */
  openExternal(url: string): Promise<void>
}

/** The subset of the framework's HTTP client this adapter needs. */
export interface HttpTransport {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body?: unknown): Promise<T>
  put<T>(url: string, body?: unknown): Promise<T>
  delete<T>(url: string): Promise<T>
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * Turn anything thrown by a request into the shared error shape.
 *
 * The framework throws an `HttpError` carrying `status` and, when the server
 * answered with one, the parsed `{ code, message }` body. Native failures are
 * already that shape. A rejected network request has neither, so it falls back
 * to an honest generic message instead of leaking "Failed to fetch".
 */
export function normalizeError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: unknown
      message?: unknown
      response?: { data?: { code?: unknown; message?: unknown } }
    }
    const body = candidate.response?.data
    if (typeof body?.code === 'string' && typeof body.message === 'string') {
      return { code: body.code, message: body.message }
    }
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        message:
          typeof candidate.message === 'string' && candidate.message !== ''
            ? candidate.message
            : '请求失败',
      }
    }
  }
  return { code: 'internal_error', message: '请求失败' }
}

/** The production adapter over `runtime.http`, which adds the bearer token. */
export function createApiClient(http: HttpTransport): ApiClient {
  const invokeNative = <T,>(command: string, input: unknown) =>
    http.post<NativeResult<T>>('/api/native', { command, input })

  return {
    async listSpaces() {
      const answer = await http.get<{ spaces: Space[] }>('/api/spaces')
      return answer.spaces
    },

    async createSpace(name) {
      const answer = await http.post<{ space: Space }>('/api/spaces', { name })
      return answer.space
    },

    async renameSpace(id, name) {
      const answer = await http.put<{ space: Space }>(`/api/spaces/${id}`, {
        name,
      })
      return answer.space
    },

    async deleteSpace(id) {
      const answer = await http.delete<{ space: Space }>(`/api/spaces/${id}`)
      return answer.space
    },

    async switchSpace(id) {
      const answer = await http.post<{ space: Space }>(
        `/api/spaces/${id}/switch`,
      )
      return answer.space
    },

    async listDirectories(spaceId) {
      const answer = await http.get<{ directories: Directory[] }>(
        `/api/directories${queryString({ spaceId })}`,
      )
      return answer.directories
    },

    async addDirectory(spaceId, path) {
      const answer = await http.post<{ directory: Directory }>(
        '/api/directories',
        { spaceId, path },
      )
      return answer.directory
    },

    async removeDirectory(id) {
      const answer = await http.delete<{ directory: Directory }>(
        `/api/directories/${id}`,
      )
      return answer.directory
    },

    async getScanStatus(spaceId) {
      return http.get<ScanStatus>(
        `/api/scan/status${queryString({ spaceId })}`,
      )
    },

    async startScan(spaceId) {
      return http.post<{ scanId: string }>('/api/scan', { spaceId })
    },

    async rebuildThumbnails(spaceId) {
      return http.post<{ scanId: string }>('/api/thumbnails/rebuild', {
        spaceId,
      })
    },

    async listVideos(query) {
      return http.get<VideoPage>(`/api/videos${queryString({ ...query })}`)
    },

    async getVideo(id) {
      const answer = await http.get<{ video: Video }>(`/api/videos/${id}`)
      return answer.video
    },

    async listPlugins() {
      const answer = await http.get<{ plugins: PluginSummary[] }>('/api/plugins')
      return answer.plugins
    },

    async getMediaTools() {
      return http.get<MediaToolDetection>('/api/media/tools')
    },

    async setFavorite(id, favorite) {
      const answer = await http.put<{ video: Video }>(
        `/api/videos/${id}/favorite`,
        { favorite },
      )
      return answer.video
    },

    async setShared(id, shared) {
      const answer = await http.put<{ shared: boolean }>(
        `/api/videos/${id}/shared`,
        { shared },
      )
      return answer.shared
    },

    async getShareStatus() {
      return http.get<ShareStatus>('/api/share/status')
    },

    async openShare() {
      return http.post<ShareStatus>('/api/share/open')
    },

    async closeShare() {
      return http.post<ShareStatus>('/api/share/close')
    },

    async resetSharePassword() {
      return http.post<ShareStatus>('/api/share/password')
    },

    async play(video) {
      const opened = await invokeNative('shell.openPath', { path: video.path })
      if (!opened.ok) throw { code: opened.code, message: opened.message }
      const answer = await http.put<{ video: Video }>(
        `/api/videos/${video.id}/played`,
      )
      return answer.video
    },

    async controlScan(scanId, action) {
      const answer = await http.post<{ scanId: string; phase: ScanPhase }>(
        `/api/scan/${encodeURIComponent(scanId)}/${action}`,
      )
      return answer.phase
    },

    async getSettings() {
      const answer = await http.get<{ settings: Record<string, unknown> }>(
        '/api/settings',
      )
      return answer.settings
    },

    async putSettings(settings) {
      const answer = await http.put<{ settings: Record<string, unknown> }>(
        '/api/settings',
        { settings },
      )
      return answer.settings
    },

    async native<T>(command: string, input: unknown) {
      return invokeNative<T>(command, input)
    },

    async openExternal(url) {
      const opened = await invokeNative('shell.openExternal', { url })
      if (opened.ok) return
      if (opened.code === 'unsupported') {
        window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      throw { code: opened.code, message: opened.message }
    },
  }
}
