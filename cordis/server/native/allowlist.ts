/**
 * `POST /api/native` 的命令白名单。
 *
 * 项目 server 虽然拥有全部原生命令，但页面只需要这几个：选择目录、用系统
 * 应用打开路径、在文件管理器中定位、发通知，以及窗口标题／尺寸／状态。
 * 其余命令（打开外部链接、关闭窗口等）不经过页面，代理层直接拒绝，避免
 * 一条前端请求就能触达不该由页面决定的原语。
 */

import type { NativeCommand } from 'cordis-app/server'

/** 允许页面经 `POST /api/native` 调用的命令。 */
export const NATIVE_PROXY_ALLOWLIST = [
  'path.chooseDirectory',
  'shell.openPath',
  'shell.showItemInFolder',
  'notification.show',
  'window.setTitle',
  'window.setSize',
  'window.state',
] as const satisfies readonly NativeCommand[]

const ALLOWED: ReadonlySet<string> = new Set(NATIVE_PROXY_ALLOWLIST)

/** 命令是否在代理白名单内；未知命令与未列入的命令走同一条拒绝路径。 */
export function isAllowedNativeCommand(value: string): boolean {
  return ALLOWED.has(value)
}
