/**
 * An in-memory stand-in for the project server, reached through the same
 * `HttpTransport` the production adapter wraps.
 *
 * Tests hand `createApiClient` this transport instead of mocking the adapter
 * methods, so what they observe is the real request shape and the page's
 * behaviour on top of it.
 */

import type { Directory, HttpTransport, Space } from '../shared/api'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RecordedCall {
  method: Method
  url: string
  body?: unknown
}

export type NativeEnvelope =
  | { ok: true; value: unknown }
  | { ok: false; code: string; message: string }

export interface FakeServerOptions {
  spaces?: Space[]
  directories?: Directory[]
  settings?: Record<string, unknown>
  scanActive?: boolean
  /** Answers `POST /api/native`; the default accepts every command. */
  native?: (command: string, input: unknown) => NativeEnvelope
}

export interface FakeServerState {
  spaces: Space[]
  directories: Directory[]
  settings: Record<string, unknown>
  scanActive: boolean
}

export interface FakeServer {
  http: HttpTransport
  calls: RecordedCall[]
  state: FakeServerState
}

/** The shape `normalizeError` reads from a failed framework request. */
function httpError(status: number, code: string, message: string): never {
  throw { status, response: { data: { code, message } } }
}

export function makeFakeServer(options: FakeServerOptions = {}): FakeServer {
  const state: FakeServerState = {
    spaces: options.spaces ?? [{ id: 1, name: '视频库', current: true }],
    directories: options.directories ?? [
      { id: 1, spaceId: 1, path: '/media/videos' },
    ],
    settings: options.settings ?? {},
    scanActive: options.scanActive ?? false,
  }
  const calls: RecordedCall[] = []
  let nextSpaceId = Math.max(0, ...state.spaces.map((space) => space.id)) + 1
  let nextDirectoryId =
    Math.max(0, ...state.directories.map((directory) => directory.id)) + 1

  const spaceById = (id: number): Space | undefined =>
    state.spaces.find((space) => space.id === id)

  const setCurrent = (id: number): void => {
    for (const space of state.spaces) space.current = space.id === id
  }

  const handlers: Record<string, (body: unknown, url: string) => unknown> = {
    'GET /api/spaces': () => ({ spaces: state.spaces }),

    'POST /api/spaces': (body) => {
      const name = String((body as { name?: unknown })?.name ?? '').trim()
      if (name === '') httpError(400, 'space.name.empty', 'Space name is empty')
      if (state.spaces.some((space) => space.name.toLowerCase() === name.toLowerCase())) {
        httpError(409, 'space.name.taken', 'Another space has this name')
      }
      const space: Space = { id: nextSpaceId++, name, current: false }
      state.spaces.push(space)
      setCurrent(space.id)
      return { space: { ...space, current: true } }
    },

    'GET /api/directories': (_body, url) => {
      const parsed = new URL(url, 'http://fake.local')
      const raw = parsed.searchParams.get('spaceId')
      const spaceId = raw === null ? state.spaces.find((s) => s.current)?.id : Number(raw)
      return {
        directories: state.directories.filter(
          (directory) => directory.spaceId === spaceId,
        ),
      }
    },

    'POST /api/directories': (body) => {
      const input = body as { path?: unknown; spaceId?: unknown }
      const path = String(input?.path ?? '')
      if (path.trim() === '') httpError(400, 'directory.path.empty', 'Directory path is empty')
      const spaceId =
        input?.spaceId === undefined
          ? state.spaces.find((space) => space.current)!.id
          : Number(input.spaceId)
      const existing = state.directories.find(
        (directory) => directory.spaceId === spaceId && directory.path === path,
      )
      if (existing) return { directory: existing }
      const directory: Directory = { id: nextDirectoryId++, spaceId, path }
      state.directories.push(directory)
      return { directory }
    },

    'GET /api/settings': () => ({ settings: { ...state.settings } }),

    'PUT /api/settings': (body) => {
      const patch = (body as { settings?: unknown })?.settings
      if (typeof patch !== 'object' || patch === null) {
        httpError(400, 'bad_request', 'body.settings must be an object')
      }
      Object.assign(state.settings, patch)
      return { settings: { ...state.settings } }
    },

    'GET /api/scan/status': () => ({
      active: state.scanActive,
      spaceId: state.spaces.find((space) => space.current)?.id,
    }),

    'POST /api/scan': () => {
      state.scanActive = true
      return { scanId: 'scan-1' }
    },

    'POST /api/thumbnails/rebuild': () => {
      state.scanActive = true
      return { scanId: 'thumbs-1' }
    },

    'POST /api/native': (body) => {
      const request = body as { command?: unknown; input?: unknown } | undefined
      const command = String(request?.command ?? '')
      return options.native?.(command, request?.input) ?? { ok: true, value: {} }
    },
  }

  const request = async (
    method: Method,
    url: string,
    body?: unknown,
  ): Promise<unknown> => {
    calls.push({ method, url, body })
    const path = new URL(url, 'http://fake.local').pathname
    const key = `${method} ${path}`
    if (handlers[key] !== undefined) return handlers[key]!(body, url)

    const spaceMatch = path.match(/^\/api\/spaces\/(\d+)$/)
    if (spaceMatch !== null) {
      const id = Number(spaceMatch[1])
      const space = spaceById(id)
      if (space === undefined) httpError(404, 'space.not_found', 'Space does not exist')
      if (method === 'PUT') {
        const name = String((body as { name?: unknown })?.name ?? '').trim()
        if (name === '') httpError(400, 'space.name.empty', 'Space name is empty')
        space!.name = name
        return { space: space! }
      }
      if (method === 'DELETE') {
        if (state.spaces.length <= 1) {
          httpError(409, 'space.remove_last', 'The last space cannot be removed')
        }
        state.spaces = state.spaces.filter((entry) => entry.id !== id)
        state.directories = state.directories.filter(
          (directory) => directory.spaceId !== id,
        )
        if (!state.spaces.some((entry) => entry.current)) {
          setCurrent(state.spaces[0]!.id)
        }
        return { space: state.spaces.find((entry) => entry.current)! }
      }
    }

    const switchMatch = path.match(/^\/api\/spaces\/(\d+)\/switch$/)
    if (switchMatch !== null && method === 'POST') {
      const id = Number(switchMatch[1])
      if (spaceById(id) === undefined) {
        httpError(404, 'space.not_found', 'Space does not exist')
      }
      setCurrent(id)
      return { space: spaceById(id)! }
    }

    const directoryMatch = path.match(/^\/api\/directories\/(\d+)$/)
    if (directoryMatch !== null && method === 'DELETE') {
      const id = Number(directoryMatch[1])
      const directory = state.directories.find((entry) => entry.id === id)
      if (directory === undefined) {
        httpError(404, 'directory.not_found', 'Directory does not exist')
      }
      state.directories = state.directories.filter((entry) => entry.id !== id)
      return { directory }
    }

    httpError(404, 'not_found', `No route for ${key}`)
  }

  return {
    calls,
    state,
    http: {
      get: <T,>(url: string) => request('GET', url) as Promise<T>,
      post: <T,>(url: string, body?: unknown) =>
        request('POST', url, body) as Promise<T>,
      put: <T,>(url: string, body?: unknown) =>
        request('PUT', url, body) as Promise<T>,
      delete: <T,>(url: string) => request('DELETE', url) as Promise<T>,
    },
  }
}
