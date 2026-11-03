/**
 * HTTP test harness.
 *
 * Collects the routes a project server registers on `ctx.router`, mounts them on
 * a real `node:http` server and drives them with `fetch`. Both the routing and
 * the business code under test are the production ones; only the kernel is
 * replaced.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KernelContext } from 'cordis-app/server'
import { installLibrary } from './index.ts'

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void | Promise<void>

interface Route {
  method: string
  segments: Segment[]
  handler: Handler
}

type Segment = { type: 'static'; value: string } | { type: 'param'; name: string }

/** The part of `KernelContext` the library actually uses. */
export interface FakeContext {
  router: {
    get(path: string, handler: Handler): () => void
    post(path: string, handler: Handler): () => void
    put(path: string, handler: Handler): () => void
    patch(path: string, handler: Handler): () => void
    delete(path: string, handler: Handler): () => void
    all(path: string, handler: Handler): () => void
  }
  effect<T>(callback: (ctx: FakeContext) => T | (() => void)): T
}

export interface HttpResult {
  status: number
  body: unknown
}

export interface Harness {
  request(method: string, path: string, body?: unknown): Promise<HttpResult>
  close(): Promise<void>
}

function compile(path: string): Segment[] {
  return path
    .split('/')
    .filter((part) => part !== '')
    .map((part) =>
      part.startsWith(':')
        ? { type: 'param' as const, name: part.slice(1) }
        : { type: 'static' as const, value: part },
    )
}

function match(segments: Segment[], parts: string[]): Record<string, string> | undefined {
  if (segments.length !== parts.length) return undefined
  const params: Record<string, string> = {}
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!
    if (segment.type === 'static') {
      if (segment.value !== parts[i]) return undefined
    } else {
      if (!parts[i]) return undefined
      params[segment.name] = decodeURIComponent(parts[i]!)
    }
  }
  return params
}

/** Mount `apply` on a real HTTP server listening on an ephemeral port. */
export async function startHarness(apply: (ctx: FakeContext) => void): Promise<Harness> {
  const routes: Route[] = []
  const disposers: (() => void)[] = []

  const add = (method: string, path: string, handler: Handler) => {
    const route: Route = { method, segments: compile(path), handler }
    routes.push(route)
    return () => {
      const index = routes.indexOf(route)
      if (index >= 0) routes.splice(index, 1)
    }
  }

  const ctx: FakeContext = {
    router: {
      get: (path, handler) => add('GET', path, handler),
      post: (path, handler) => add('POST', path, handler),
      put: (path, handler) => add('PUT', path, handler),
      patch: (path, handler) => add('PATCH', path, handler),
      delete: (path, handler) => add('DELETE', path, handler),
      all: (path, handler) => add('*', path, handler),
    },
    effect<T>(callback: (ctx: FakeContext) => T | (() => void)): T {
      const result = callback(ctx)
      if (typeof result === 'function') disposers.push(result as () => void)
      return result
    },
  }

  apply(ctx)

  const server = createServer((req, res) => {
    void handle(req, res)
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    for (const route of routes) {
      if (route.method !== '*' && route.method !== req.method) continue
      const params = match(route.segments, parts)
      if (!params) continue
      try {
        await route.handler(req, res, params)
      } catch (error) {
        if (!res.headersSent) {
          const payload = JSON.stringify({ code: 'internal_error', message: String(error) })
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(payload)
        }
      }
      return
    }
    if (!res.headersSent) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 'not_found', message: `no handler for ${url.pathname}` }))
    }
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`

  return {
    async request(method, path, body) {
      const init: RequestInit = { method }
      if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' }
        init.body = JSON.stringify(body)
      }
      const response = await fetch(base + path, init)
      const text = await response.text()
      let parsed: unknown = undefined
      if (text) {
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = text
        }
      }
      return { status: response.status, body: parsed }
    },
    async close() {
      for (const dispose of disposers.reverse()) dispose()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export interface LibraryFixture {
  harness: Harness
  dataDir: string
  /** Toggle the injected scan-slot stub. */
  scanning: { active: boolean }
  close(): Promise<void>
}

/** Start a library on a throwaway data directory and clean both up on close. */
export async function openLibrary(): Promise<LibraryFixture> {
  const dataDir = mkdtempSync(join(tmpdir(), 'enjoy-cordis-library-'))
  const scanning = { active: false }
  const harness = await startHarness((ctx) => {
    installLibrary(ctx as unknown as KernelContext, {
      dataDir,
      isScanActive: () => scanning.active,
    })
  })
  return {
    harness,
    dataDir,
    scanning,
    async close() {
      await harness.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
