/**
 * The HTTP seam the pages talk to.
 *
 * Everything below `/api` is reached through this one interface: the real
 * implementation wraps the framework's token-injecting HTTP client, and tests
 * hand the pages a fake with the same shape. Errors always cross this seam as
 * `{ code, message }`, whichever side produced them.
 */

export type VideoFilter = 'all' | 'favorites' | 'played'
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
  playCount: number
  lastPlayedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface VideoPage {
  videos: Video[]
  total: number
}

export interface VideoListQuery {
  spaceId: number
  only: VideoFilter
  sort: VideoSort
  offset: number
  limit: number
}

/** The address of one video's cached JPEG; the scan writes it, this route serves it. */
export function thumbnailUrl(videoId: number): string {
  return `/api/thumbnails/${videoId}`
}

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
  setFavorite(id: number, favorite: boolean): Promise<Video>
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

    async setFavorite(id, favorite) {
      const answer = await http.put<{ video: Video }>(
        `/api/videos/${id}/favorite`,
        { favorite },
      )
      return answer.video
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
