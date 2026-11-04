/**
 * Read-only WebDAV listener for the share feature.
 *
 * Contract for callers (the share state module, #122):
 *
 *   const server = await createWebdavServer({
 *     paths,                                  // absolute files to expose
 *     credentials: { username, password },    // Basic auth
 *     language: 'zh-CN' | 'en',               // landing-page fallback
 *     port: 4918,                             // 0 picks a free port
 *     onAuthenticated: ({ address, userAgent }) => void, // activity hook
 *   })
 *   server.port          // the port actually bound
 *   server.missingFiles  // inputs missing or not a regular file
 *   await server.close() // idempotent, resolves after the port is released
 *
 * The listener owns no database and no application state. It builds one
 * snapshot at startup and serves only that snapshot: later changes on disk
 * surface as 404 for a virtual name, never as a different listing.
 * Authentication is required for every request, including `OPTIONS` and the
 * browser landing page.
 */

import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { landingPage, selectLanguage, type WebdavLanguage } from './landing.ts'
import { contentTypeFor } from './mime.ts'
import { parseRange } from './range.ts'
import { buildSnapshot, type SnapshotFile, type WebdavSnapshot } from './snapshot.ts'
import {
  etagFor,
  fileMultistatus,
  infiniteDepthError,
  lastModifiedFor,
  multistatus,
} from './xml.ts'

export type { WebdavLanguage } from './landing.ts'
export type { SnapshotFile, WebdavSnapshot } from './snapshot.ts'

/** The first port a listener asks for when the caller names none. */
export const DEFAULT_PORT = 4918

export interface WebdavCredentials {
  username: string
  password: string
}

/** What the activity hook is told after a request passes authentication. */
export interface WebdavAuthenticatedRequest {
  /** Peer address of the connection, as the socket reports it. */
  address: string
  /** Raw `User-Agent` header, when the client sent one. */
  userAgent: string | undefined
}

export interface WebdavServerOptions {
  /** Absolute paths of the files to expose. Order is irrelevant: paths sort. */
  paths: readonly string[]
  credentials: WebdavCredentials
  /** Landing-page language when the browser sends no usable Accept-Language. */
  language: WebdavLanguage
  /** Port to bind on `0.0.0.0`; `0` asks the OS for a free one. Default 4918. */
  port?: number
  /**
   * Called once per request that passes Basic authentication, including
   * requests that are then refused (writes, unknown names). The share state
   * layer uses it for the recent-device list.
   */
  onAuthenticated?: (request: WebdavAuthenticatedRequest) => void
}

export interface WebdavServer {
  /** The port actually bound. */
  port: number
  /** Inputs that were missing or not a regular file when the snapshot was built. */
  missingFiles: number
  /** Stop accepting connections and release the port. Safe to call twice. */
  close(): Promise<void>
}

const CHALLENGE = 'Basic realm="Enjoy", charset="UTF-8"'
const ALLOWED_METHODS = 'OPTIONS, PROPFIND, GET, HEAD'
const WRITE_METHODS = new Set([
  'PUT',
  'DELETE',
  'MKCOL',
  'MOVE',
  'COPY',
  'PROPPATCH',
  'LOCK',
  'UNLOCK',
])

/** Read `Authorization: Basic ...` and compare both fields exactly. */
function authorized(header: string | undefined, credentials: WebdavCredentials): boolean {
  const match = /^Basic\s+(.+)$/i.exec(header ?? '')
  if (!match) return false
  const decoded = Buffer.from(match[1]!.trim(), 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator < 0) return false
  return (
    decoded.slice(0, separator) === credentials.username &&
    decoded.slice(separator + 1) === credentials.password
  )
}

function sendEmpty(res: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-length': '0', ...headers })
  res.end()
}

function sendLanding(
  req: IncomingMessage,
  res: ServerResponse,
  language: WebdavLanguage,
): void {
  const selected = selectLanguage(req.headers['accept-language'], language)
  const html = landingPage(selected)
  const bytes = Buffer.byteLength(html)
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': bytes,
    'cache-control': 'no-store',
  })
  res.end(req.method === 'HEAD' ? undefined : html)
}

export async function createWebdavServer(
  options: WebdavServerOptions,
): Promise<WebdavServer> {
  const snapshot: WebdavSnapshot = buildSnapshot(options.paths)

  const server = createServer((req, res) => {
    // Drain any request body so keep-alive connections stay usable even
    // though this protocol subset ignores PROPFIND bodies and rejects writes.
    req.resume()
    handle(req, res, snapshot, options)
  })

  const close = (): Promise<void> => {
    if (!server.listening) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? DEFAULT_PORT, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const { port } = server.address() as AddressInfo
  return { port, missingFiles: snapshot.missingFiles, close }
}

function sendXml(res: ServerResponse, status: number, xml: string): void {
  res.writeHead(status, {
    'content-type': 'application/xml; charset=utf-8',
    'content-length': Buffer.byteLength(xml),
    'cache-control': 'no-store',
  })
  res.end(xml)
}

function handle(
  req: IncomingMessage,
  res: ServerResponse,
  snapshot: WebdavSnapshot,
  options: WebdavServerOptions,
): void {
  if (!authorized(req.headers.authorization, options.credentials)) {
    sendEmpty(res, 401, { 'www-authenticate': CHALLENGE })
    return
  }

  // Past this point the caller knows the password, so the share state layer
  // may count it as a client. A failure in that bookkeeping is not a reason to
  // fail a request the client is entitled to.
  if (options.onAuthenticated) {
    try {
      options.onAuthenticated({
        address: req.socket.remoteAddress ?? '',
        userAgent: req.headers['user-agent'],
      })
    } catch {
      // The listener owns the protocol, not the observer's state.
    }
  }

  const method = req.method ?? ''
  if (WRITE_METHODS.has(method)) {
    sendEmpty(res, 403)
    return
  }

  const target = resolveTarget(req.url, snapshot)
  if (target === null || target === 'unknown') {
    sendEmpty(res, 404)
    return
  }

  if (method === 'OPTIONS') {
    res.writeHead(200, {
      dav: '1',
      'ms-author-via': 'DAV',
      allow: ALLOWED_METHODS,
      'content-length': '0',
    })
    res.end()
    return
  }

  if (method === 'PROPFIND') {
    sendPropfind(req, res, target, snapshot)
    return
  }

  if (method === 'GET' || method === 'HEAD') {
    if (target === 'root') sendLanding(req, res, options.language)
    else sendFile(req, res, target)
    return
  }

  sendEmpty(res, 405, { allow: ALLOWED_METHODS })
}

function sendPropfind(
  req: IncomingMessage,
  res: ServerResponse,
  target: Exclude<Target, 'unknown'>,
  snapshot: WebdavSnapshot,
): void {
  const depthHeader = String(req.headers.depth ?? '1').trim().toLowerCase()

  if (target === 'root') {
    if (depthHeader === 'infinity') {
      sendXml(res, 403, infiniteDepthError())
      return
    }
    const files = depthHeader === '0' ? [] : snapshot.files
    sendXml(res, 207, multistatus(files))
    return
  }

  // A file can disappear after the snapshot was built: the name answers 404
  // here as it does to GET, while the root listing keeps the snapshot's name.
  if (!filePresent(target)) {
    sendEmpty(res, 404)
    return
  }
  if (depthHeader === 'infinity') {
    sendXml(res, 403, infiniteDepthError())
    return
  }

  sendXml(res, 207, fileMultistatus(target))
}

/** Whether the snapshot's source is still a regular file on disk. */
function filePresent(file: SnapshotFile): boolean {
  try {
    return statSync(file.path).isFile()
  } catch {
    return false
  }
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: SnapshotFile): void {
  if (!filePresent(file)) {
    sendEmpty(res, 404)
    return
  }

  const common = {
    'content-type': contentTypeFor(file.name),
    'last-modified': lastModifiedFor(file),
    etag: etagFor(file),
    'accept-ranges': 'bytes',
  }
  const range = parseRange(req.headers.range, file.size)

  if (range.kind === 'unsatisfiable') {
    res.writeHead(416, {
      ...common,
      'content-range': `bytes */${file.size}`,
      'content-length': '0',
    })
    res.end()
    return
  }

  if (range.kind === 'range') {
    const length = range.end - range.start + 1
    res.writeHead(206, {
      ...common,
      'content-range': `bytes ${range.start}-${range.end}/${file.size}`,
      'content-length': String(length),
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(file.path, { start: range.start, end: range.end })
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    return
  }

  res.writeHead(200, { ...common, 'content-length': String(file.size) })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file.path)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

type Target = 'root' | SnapshotFile | 'unknown'

/**
 * Resolve the raw request path to the root or one virtual name.
 *
 * The raw URL is used rather than `new URL(...)`: the URL parser collapses
 * `..`, which would hide traversal attempts from the check below.
 */
function resolveTarget(rawUrl: string | undefined, snapshot: WebdavSnapshot): Target | null {
  const raw = rawUrl ?? '/'
  const query = raw.indexOf('?')
  const path = query < 0 ? raw : raw.slice(0, query)
  if (!path.startsWith('/')) return null
  if (path === '/') return 'root'

  const encoded = path.slice(1)
  let name: string
  try {
    name = decodeURIComponent(encoded)
  } catch {
    return null
  }
  if (name === '' || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null
  }
  return snapshot.byName.get(name) ?? 'unknown'
}
