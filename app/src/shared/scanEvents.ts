/**
 * Scan progress arrives on its own WebSocket channel.
 *
 * The framework's client connection only reports reconnects for the `default`
 * channel, so a body that wants scan messages opens `/__ws?channel=scan`
 * itself. The token rides in the query string because the browser WebSocket
 * constructor cannot set headers.
 */

import type { ScanChanges, ScanPhase } from './api'

export type { ScanChanges }

/** Phases in which the backend's scan slot is occupied, so space commands are
 *  refused. Shared by the settings page and the header's space switcher. */
export const ACTIVE_SCAN_PHASES: ReadonlySet<ScanPhase> = new Set([
  'discovering',
  'indexing',
  'metadata',
  'thumbnails',
  'paused',
])

export interface ScanEvent {
  scanId: string
  spaceId: number
  phase: ScanPhase
  changes?: ScanChanges
  failures?: number
  unreachableDirectories?: number
  discovered?: number
  processed?: number
  indexed?: number
  metadataReady?: number
  thumbnailsReady?: number
  currentPath?: string
}

export interface ScanSubscriptionOptions {
  /**
   * Called each time the shared socket opens. `reconnected` is false for the
   * first connection of this subscription: a caller that fetched the status on
   * mount only has to fetch again after a gap.
   */
  onConnect?: (reconnected: boolean) => void
}

export interface ScanEventSource {
  /** Listen for scan events; the returned function stops listening. */
  subscribe(
    listener: (event: ScanEvent) => void,
    options?: ScanSubscriptionOptions,
  ): () => void
}

export interface ScanSourceOptions {
  token: string
  /** Injection point for tests; defaults to the browser implementation. */
  WebSocketImpl?: typeof WebSocket
  reconnectDelayMs?: number
}

/** Accept both a bare payload and the framework's `{ type, data }` envelope. */
function toScanEvent(value: unknown): ScanEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const envelope = value as { data?: unknown }
  const candidate = (
    typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data
      : value
  ) as Partial<ScanEvent>
  if (
    typeof candidate.scanId !== 'string' ||
    typeof candidate.spaceId !== 'number' ||
    typeof candidate.phase !== 'string'
  ) {
    return null
  }
  return candidate as ScanEvent
}

function socketUrl(token: string): string {
  const url = new URL('/__ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('channel', 'scan')
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Open one shared socket for every subscriber. It closes when the last
 * subscriber leaves, and retries with a fixed delay after a drop; a scan that
 * finished during the gap is caught by the listing's next read.
 */
export function createScanEventSource({
  token,
  WebSocketImpl,
  reconnectDelayMs = 2000,
}: ScanSourceOptions): ScanEventSource {
  const listeners = new Map<
    (event: ScanEvent) => void,
    ScanSubscriptionOptions | undefined
  >()
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  /** How many sockets have opened for the current subscription set. */
  let connections = 0

  const connect = () => {
    const Impl = WebSocketImpl ?? (typeof WebSocket === 'undefined' ? null : WebSocket)
    if (stopped || Impl === null || socket !== null || listeners.size === 0) return
    const current = new Impl(socketUrl(token))
    socket = current
    current.onopen = () => {
      const reconnected = connections > 0
      connections += 1
      for (const options of listeners.values()) {
        options?.onConnect?.(reconnected)
      }
    }
    current.onmessage = (message) => {
      try {
        const event = toScanEvent(JSON.parse(String(message.data)))
        if (event !== null) {
          for (const listener of [...listeners.keys()]) listener(event)
        }
      } catch {
        // A malformed frame is not worth dropping a working connection over.
      }
    }
    current.onclose = () => {
      if (socket === current) socket = null
      if (!stopped && listeners.size > 0) {
        retry = setTimeout(() => {
          retry = null
          connect()
        }, reconnectDelayMs)
      }
    }
    current.onerror = () => {
      current.close()
    }
  }

  return {
    subscribe(listener, options) {
      listeners.set(listener, options)
      stopped = false
      connect()
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        stopped = true
        connections = 0
        if (retry !== null) {
          clearTimeout(retry)
          retry = null
        }
        if (socket !== null) {
          const current = socket
          socket = null
          current.close()
        }
      }
    },
  }
}
