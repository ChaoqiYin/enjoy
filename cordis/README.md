# Enjoy · cordis 项目

Enjoy 重写第一版的应用项目骨架，由本地 checkout 的 [cordis-app](../../cordis-app) 驱动。

## 依赖写法

`cordis-app` 尚未发布到 npm，因此这里用本地 `file:` 依赖，并用 `pnpm.overrides` 把框架内部的六个包指回同一个 checkout：

```json
{
  "dependencies": {
    "cordis-app": "file:../../cordis-app/packages/cordis-app"
  },
  "pnpm": {
    "overrides": {
      "@cordis-app/cli": "file:../../cordis-app/packages/cli",
      "@cordis-app/kernel": "file:../../cordis-app/packages/kernel",
      "@cordis-app/preset": "file:../../cordis-app/packages/preset",
      "@cordis-app/protocol": "file:../../cordis-app/packages/protocol",
      "@cordis-app/runtime": "file:../../cordis-app/packages/runtime",
      "@cordis-app/ui": "file:../../cordis-app/packages/ui"
    }
  }
}
```

路径的前提是 `cordis-app` 与 `Enjoy` 位于同一级目录：

```text
<workspace>/
├── cordis-app/
└── Enjoy/
    └── cordis/     ← 本目录
```

移动任一仓库后都要改上面的相对路径并重新安装。

## 前置条件

`cordis-app` 必须先构建出 `packages/*/lib`、`packages/ui/dist` 与 `packages/cordis-app/bin`，否则 `file:` 目录依赖拿不到入口文件：

```bash
cd ../../cordis-app
pnpm build
```

## 扫描线程入口

`server/scan-worker.ts` 是第二个服务端入口。框架的 `server/` 多入口构建会把它打包到 `dist/server/scan-worker.js`（开发模式是 `.cordis/dev/server/scan-worker.js`），与 `index.js` 同目录，因此主线程用 `new Worker(new URL('./scan-worker.js', import.meta.url))` 加载。

`pnpm test` 直接跑 TypeScript 源码，没有构建产物。Node 24 默认启用类型剥离，`Worker` 可以直接加载 `.ts` 入口；`server/scan/index.ts` 按候选路径依次查找，源码形态回落到 `server/scan-worker.ts`。这段回落只在测试/直接跑源码时生效，构建形态始终命中同目录的 `scan-worker.js`。

## 常用命令

以下命令都在 `cordis/` 目录执行：

```bash
pnpm install          # 安装依赖
pnpm css              # 生成 Tailwind 工具样式（dev/build 会先自动执行）
pnpm dev              # 浏览器模式开发（原生能力为 unsupported）
pnpm dev:shell        # 带桌面外壳开发（需要 Go 1.25）
pnpm test             # 运行后端 node:test 与前端 Vitest
pnpm build            # 构建到 dist/
pnpm start            # 运行 dist/ 产物
```

开发服务的端口写在 `.cordis/runtime.json`，健康检查：

```bash
curl -fsS "http://127.0.0.1:$(node -p "require('./.cordis/runtime.json').port")/__health"
```

冒烟检查：

```bash
pnpm smoke:sqlite     # node:sqlite 建库、写入、读回并确认 WAL
pnpm smoke:start      # 启动 dev、等待 /__health 200、再停止进程
```

## 前端接线（本单确认过的结论）

### body 与样式

- `cordis-app` 构建项目前端时固定使用 Vite 的 `react()`、`bodyPlugin` 与 `importMapPlugin()`；`bodyPlugin` 只把 `virtual:cordis-app/body` 换成项目的 `src/body.tsx`。项目没有注入 Vite 插件的入口，因此不能直接加 `@tailwindcss/vite`。
- 采用的做法：`pnpm css` 调用 Tailwind CLI，把 `src/styles.tailwind.css` 编译成 `src/styles.generated.css`（已 gitignore）。`src/styles.css` 先 `@import` 生成物，再补 `html/body/#root` 的高度；`src/body.tsx` 导入 `src/styles.css`。`dev`、`dev:shell` 与 `build` 都先执行 `pnpm css`，所以构建前不需要手工生成，产物里也确有这份 CSS。
- 样式只保留视频/收藏页实际使用的语义 token（background、card、primary、selection、hover、destructive、warning 等），浅色/深色值对齐 `frontend/src/style.css`；框架 `restoreAppearance()` 写的是 `data-theme`，所以深色变体也按这个属性声明。
- body 自己画侧边栏和四个路由（`/`、`/favorites`、`/settings`、`/plugins`），不渲染插件的页面出口、slot 或设置面板；`/settings` 与 `/plugins` 本单只放占位内容。

### auth 与 `/api`

- 框架壳启动时用 `bootstrapToken()` 从 URL 的 `#token=` 取 token，存进 `sessionStorage` 的 `cordis-app/token`，随后把 hash 抹掉。项目代码通过 `useRuntime()` 拿到 `runtime.token`。
- `/api/*` 的请求统一走 `runtime.http`：它自动加 `Authorization: Bearer <token>`，非 2xx 抛 `HttpError`。`src/shared/api.ts` 的 `createApiClient(runtime.http)` 把 spaces、videos、directories、settings、native 包成带类型的 `ApiClient`，并把所有错误归一为 `{ code, message }`；原生失败也是这个形状（`POST /api/native` 以 HTTP 200 返回 `{ ok: false, code, message }`）。
- 播放调用 `POST /api/native` 的 `shell.openPath`（入参 `{ path }`），成功后再 `PUT /api/videos/:id/played`；失败提示会区分 `unsupported`，并给出「复制路径」。

### 扫描事件

- 框架客户端 `connect()` 只负责 `default` 频道的重连通知，不把业务消息交给 body。扫描进度由 body 自己开一条 WebSocket：`/__ws?channel=scan&token=<token>`（浏览器的 WebSocket 构造器不能设请求头，所以 token 放在查询串）。
- `src/shared/scanEvents.ts` 惰性建立这一条连接，兼容裸事件与框架 `{ type, data }` 信封，按 `spaceId` 过滤；收到 `phase` 为 `done` 或 `cancelled` 时让当前列表重新读取。扫描对话框本单不做，因此没有使用 `GET /api/scan/status` 补状态。

## 坑

- **cordis-app 改动后要重新 `pnpm install`。** pnpm 10 对目录 `file:` 依赖使用硬链接而不是软链接：原地覆盖已有文件能被看到，但新增文件或新增构建产物不会自动出现在 `node_modules/.pnpm` 里。改完框架先 `pnpm build`，再回本目录 `pnpm install`（必要时 `pnpm install --force`）。
- `pnpm install` 可能提示 `Ignored build scripts: esbuild@...`。这不影响构建；如果遇到 esbuild 平台二进制问题再执行 `pnpm approve-builds`。
- `app.json` 不声明 `ui`，`plugins` 为空。项目 body 自己画导航与页面；设置页、扫描对话框与插件界面留给后续任务。
- 不要在本目录引入 `package-lock.json`；本目录只使用 pnpm。
