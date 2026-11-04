/**
 * WebDAV test fixture: files on disk, a real listener on an ephemeral port and
 * a `fetch` helper that speaks the protocol.
 *
 * Nothing here knows how the server is built; the tests only see bytes and
 * headers on the wire.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createWebdavServer,
  type WebdavServer,
  type WebdavServerOptions,
} from '../../../server/share/webdav.ts'

export const CREDENTIALS = { username: 'enjoy', password: '1234' }

export interface WebdavResponse {
  status: number
  headers: Headers
  body: Buffer
  text: string
}

export interface RequestOptions {
  /** `false` sends no Authorization header; an object overrides the password. */
  auth?: false | { username: string; password: string }
  headers?: Record<string, string>
  body?: string
}

/** Write a file into a fresh temp directory and answer its absolute path. */
export function writeVideo(directory: string, name: string, contents = 'video-bytes'): string {
  const path = join(directory, name)
  writeFileSync(path, contents)
  return path
}

/** Create a brand-new temp directory the caller is responsible for removing. */
export function makeTempDir(prefix = 'enjoy-webdav-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function removeTempDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
}

function headersFor(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = { ...options.headers }
  if (options.auth !== false) {
    const credentials = options.auth ?? CREDENTIALS
    headers.authorization = `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64')}`
  }
  return headers
}

/** Start a WebDAV listener over `paths`; `port: 0` picks a free port. */
export async function openWebdav(
  paths: string[],
  options: Partial<Omit<WebdavServerOptions, 'paths'>> = {},
): Promise<{
  server: WebdavServer
  port: number
  request(method: string, path?: string, options?: RequestOptions): Promise<WebdavResponse>
  /**
   * Send the path byte-for-byte, without the URL parser collapsing `..`.
   * `fetch` normalises dot segments before the request leaves the client.
   */
  rawRequest(method: string, path: string, options?: RequestOptions): Promise<WebdavResponse>
  close(): Promise<void>
}> {
  const server = await createWebdavServer({
    paths,
    credentials: CREDENTIALS,
    language: 'zh-CN',
    port: 0,
    ...options,
  })
  const { port } = server
  const base = `http://127.0.0.1:${port}`

  return {
    server,
    port,
    async request(method, path = '/', requestOptions = {}) {
      const headers = headersFor(requestOptions)
      const init: RequestInit = { method, headers }
      if (requestOptions.body !== undefined) init.body = requestOptions.body
      const response = await fetch(base + path, init)
      const body = Buffer.from(await response.arrayBuffer())
      return { status: response.status, headers: response.headers, body, text: body.toString('utf8') }
    },
    rawRequest(method, path, requestOptions = {}) {
      return new Promise((resolve, reject) => {
        const request = httpRequest(
          { host: '127.0.0.1', port, method, path, headers: headersFor(requestOptions) },
          (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => {
              const body = Buffer.concat(chunks)
              const headers = new Headers()
              for (const [key, value] of Object.entries(response.headers)) {
                if (value !== undefined) {
                  headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
                }
              }
              resolve({
                status: response.statusCode ?? 0,
                headers,
                body,
                text: body.toString('utf8'),
              })
            })
          },
        )
        request.on('error', reject)
        request.end(requestOptions.body)
      })
    },
    async close() {
      await server.close()
    },
  }
}
