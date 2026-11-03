/**
 * `POST /api/native`：把前端的原生能力请求转交给 `ctx.native`。
 *
 * 这是一个刻意很薄的代理：命令校验之外不做任何转换，成功与失败的 envelope
 * 都原样返回。前端按 envelope 的 `code` 分支（`unsupported` 是正常降级），
 * 所以这里不能吞掉错误码，也不能把业务失败改写成 HTTP 错误。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  KernelContext,
  NativeCommand,
  NativeInput,
  NativeResult,
} from 'cordis-app/server'

import { isAllowedNativeCommand } from './allowlist.ts'

/** 依赖注入的原生客户端；项目里就是 `ctx.native`。 */
export interface NativeInvoker {
  invoke<C extends NativeCommand>(
    command: C,
    input: NativeInput<C>,
  ): Promise<NativeResult<C>>
}

/** 注册路由所需的最小 ctx 面，测试因此不必起完整内核。 */
export interface NativeRouteContext {
  router: Pick<KernelContext['router'], 'post'>
  native: NativeInvoker
}

export interface NativeProxyOptions {
  invoke: NativeInvoker['invoke']
}

/** 与框架 `sendError` 一致的错误形状，前端按 `code` 分支。 */
interface ErrorPayload {
  code: string
  message: string
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  const payload: ErrorPayload = { code, message }
  sendJson(res, status, payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return undefined
  return JSON.parse(text)
}

/**
 * 创建 `POST /api/native` 的处理器。
 *
 * `invoke` 是唯一的外部依赖，测试用假客户端即可覆盖全部分支。
 */
export function createNativeProxy({ invoke }: NativeProxyOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'bad_request', '请求体必须是 JSON')
      return
    }

    const request = body as { command?: unknown; input?: unknown } | undefined
    if (!request || typeof request.command !== 'string') {
      sendError(res, 400, 'bad_request', '请求体需要 { command: string, input }')
      return
    }

    const command = request.command as NativeCommand
    if (!isAllowedNativeCommand(command)) {
      sendError(
        res,
        403,
        'command_not_allowed',
        `原生命令 ${command} 不在白名单内`,
      )
      return
    }

    const input = (request.input ?? {}) as NativeInput<typeof command>
    const result = await invoke(command, input)
    sendJson(res, 200, result)
  }
}

/** 在项目 server 上挂载原生代理路由。 */
export function registerNativeRoutes(
  ctx: NativeRouteContext,
  options: NativeProxyOptions = ctx.native,
): void {
  ctx.router.post('/api/native', createNativeProxy(options))
}
