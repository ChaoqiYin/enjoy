import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import test from 'node:test'

import type {
  KernelContext,
  NativeCommand,
  NativeFailure,
  NativeInput,
  NativeResult,
} from 'cordis-app/server'

import { registerNativeRoutes } from './index.ts'

interface CapturedRoute {
  method: 'POST'
  path: string
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ) => void | Promise<void>
}

interface TestServer {
  url: string
  close(): Promise<void>
}

/**
 * 假 ctx 收集路由，再用真实的 node:http 把它们挂起来。
 *
 * 测试只通过 HTTP 观察行为：不碰处理器内部，也不依赖框架的请求视图。
 */
function startTestServer(options: {
  invoke: <C extends NativeCommand>(
    command: C,
    input: NativeInput<C>,
  ) => Promise<NativeResult<C>>
}): Promise<TestServer> {
  const routes: CapturedRoute[] = []
  const router = {
    post(path: string, handler: CapturedRoute['handler']) {
      routes.push({ method: 'POST', path, handler })
      return () => {}
    },
  } as unknown as KernelContext['router']

  registerNativeRoutes({
    router,
    native: { invoke: options.invoke },
  })

  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const route = routes.find(
      (candidate) => candidate.method === req.method && candidate.path === pathname,
    )
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 'not_found', message: '没有匹配的路由' }))
      return
    }
    void Promise.resolve(route.handler(req, res, {})).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('测试服务器没有拿到端口'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

async function postNative(
  server: TestServer,
  body: unknown,
): Promise<{ status: number; body: any }> {
  return postNativeText(server, JSON.stringify(body))
}

async function postNativeText(
  server: TestServer,
  text: string,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${server.url}/api/native`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
  })
  return { status: response.status, body: await response.json() }
}

test('白名单命令把请求原样交给 ctx.native 并返回 envelope', async () => {
  const calls: Array<{ command: string; input: unknown }> = []
  const server = await startTestServer({
    async invoke(command, input) {
      calls.push({ command, input })
      return { ok: true, value: { paths: ['/Users/me/Videos'] } }
    },
  })

  try {
    const response = await postNative(server, {
      command: 'path.chooseDirectory',
      input: { multiple: false },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, {
      ok: true,
      value: { paths: ['/Users/me/Videos'] },
    })
    assert.deepEqual(calls, [
      { command: 'path.chooseDirectory', input: { multiple: false } },
    ])
  } finally {
    await server.close()
  }
})

test('未列入白名单的命令被拒绝，而且不会触达 ctx.native', async () => {
  const calls: Array<{ command: string; input: unknown }> = []
  const server = await startTestServer({
    async invoke(command, input) {
      calls.push({ command, input })
      return { ok: true, value: {} }
    },
  })

  try {
    const response = await postNative(server, {
      command: 'window.close',
      input: {},
    })

    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'command_not_allowed')
    assert.match(response.body.message, /window\.close/)
    assert.deepEqual(calls, [])
  } finally {
    await server.close()
  }
})

test('unsupported 等业务失败按原 envelope 返回，不转成 HTTP 错误', async () => {
  const failure: NativeFailure = {
    ok: false,
    code: 'unsupported',
    message: '当前没有可用的原生外壳',
  }
  const server = await startTestServer({
    async invoke() {
      return failure
    },
  })

  try {
    const response = await postNative(server, {
      command: 'window.state',
      input: {},
    })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, failure)
  } finally {
    await server.close()
  }
})

test('请求体超过 1 MiB 时按共享 HTTP 错误返回 413', async () => {
  const server = await startTestServer({
    async invoke() {
      return { ok: true, value: {} }
    },
  })

  try {
    const oversized = JSON.stringify({
      command: 'window.state',
      input: { padding: 'x'.repeat(1024 * 1024) },
    })
    const response = await postNativeText(server, oversized)

    assert.equal(response.status, 413)
    assert.equal(response.body.code, 'payload_too_large')
  } finally {
    await server.close()
  }
})

test('无法解析的 JSON 按共享 HTTP 错误返回 bad_request', async () => {
  const server = await startTestServer({
    async invoke() {
      return { ok: true, value: {} }
    },
  })

  try {
    const response = await postNativeText(server, '{')

    assert.equal(response.status, 400)
    assert.deepEqual(response.body, {
      code: 'bad_request',
      message: '请求体不是合法的 JSON',
    })
  } finally {
    await server.close()
  }
})
