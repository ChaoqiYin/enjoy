/** JSON request and response helpers for the library API. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApiError } from './errors.ts'

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { code, message })
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > 1024 * 1024) {
      throw new ApiError(413, 'payload_too_large', '请求体超过 1 MiB')
    }
    chunks.push(buf)
  }
  if (!chunks.length) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(400, 'bad_request', '请求体不是合法的 JSON')
  }
}
