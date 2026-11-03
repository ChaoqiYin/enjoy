# Enjoy · cordis 项目

Enjoy 重写第一版的应用项目骨架，由本地 checkout 的 [cordis-app](../../cordis-app) 驱动。

第一版把运行时、数据层与界面迁到 cordis-app；仓库里的旧 `src-tauri/` 与 `frontend/` 仍然保留，作为第一版的实现与迁移参照，不再参与新版本的构建与启动。

## 环境要求

- Node.js >= 24（数据层使用 `node:sqlite`，无需实验 flag）
- pnpm 10
- `ffmpeg` 与 `ffprobe`：扫描读取时长、尺寸、编码并生成缩略图时使用；第一版不随包分发，需要自行安装（macOS `brew install ffmpeg`，Debian/Ubuntu `sudo apt install ffmpeg`）
- `dev:shell` 额外需要 Go 1.25（外壳首次启动时构建）
- 与本仓库同级的 `cordis-app` checkout

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

框架侧有改动时，构建后还要回本目录重新 `pnpm install`（见「坑」）。

## 安装、开发、构建、启动

以下命令都在 `cordis/` 目录执行：

```bash
pnpm install          # 安装依赖；首次或框架更新后执行
pnpm dev              # 浏览器开发模式；原生能力返回 unsupported
pnpm dev:shell        # 桌面外壳开发模式；需要 Go 1.25
pnpm build            # 生成 Tailwind 样式并构建到 dist/
pnpm start            # 运行 dist/ 产物
pnpm test             # 后端 node:test + 前端 Vitest
```

`pnpm dev` 与 `pnpm build` 会先执行 `pnpm css`，不需要手工生成 `src/styles.generated.css`。

`pnpm start` 默认打开系统浏览器，端口与 token 写在 `.cordis/runtime.json`。健康检查：

```bash
curl -fsS "http://127.0.0.1:$(node -p "require('./.cordis/runtime.json').port")/__health"
```

页面入口是 `http://127.0.0.1:<port>/#token=<token>`。`/api/*` 需要 `Authorization: Bearer <token>`。常用参数：`--no-open` 不打开浏览器，`--port <n>` 指定端口。

额外的冒烟脚本：

```bash
pnpm smoke:sqlite     # node:sqlite 建库、写入、读回并确认 WAL
pnpm smoke:start      # 启动 dev、等待 /__health 200、再停止进程
```

### `dev:shell` 的本地 file: 前置

本目录的 `cordis-app` 是 `file:` 依赖，CLI 从自身位置找不到外壳二进制，需要用 `CORDIS_APP_SHELL` 显式指定；外壳又按启动目录（向上找 `pnpm-workspace.yaml`）定位 supervisor，所以要从 `cordis-app` 仓库根启动，再用 `--project` 指向本目录：

```bash
cd ../../cordis-app
CORDIS_APP_SHELL="$PWD/dist/cordis-app" \
  ./packages/cordis-app/bin/cordis-app.js dev --shell --project ../Enjoy/cordis
```

路径按本机 checkout 调整；在 worktree 里要把 `--project` 指向对应 worktree 的 `cordis/`。

## 媒体工具

扫描的视频元数据与缩略图由 ffmpeg/ffprobe 完成。查找顺序：

1. `ENJOY_FFMPEG` / `ENJOY_FFPROBE` 指定的可执行文件；
2. `PATH`；
3. 常见系统目录：`/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`、`/bin`。

第 3 步是必要的：cordis-app 的 worker 环境刻意清空 `PATH`，只靠 `PATH` 会找不到工具，扫描会把每个文件记成两项失败。`ENJOY_*` 只在直接运行服务端（测试、脚本）时生效；经 `cordis-app start` 启动时 worker 不继承外层环境变量，此时请把工具安装到常见目录。

打包形态还没有探测随包分发的资源目录（`TODO(#114)`），检测顺序仍是上面三步；第一版把工具留给用户自备。

## 扫描线程入口

`server/scan-worker.ts` 是第二个服务端入口。框架的 `server/` 多入口构建会把它打包到 `dist/server/scan-worker.js`（开发模式是 `.cordis/dev/server/scan-worker.js`），与 `index.js` 同目录，因此主线程用 `new Worker(new URL('./scan-worker.js', import.meta.url))` 加载。

`pnpm test` 直接跑 TypeScript 源码，没有构建产物。Node 24 默认启用类型剥离，`Worker` 可以直接加载 `.ts` 入口；`server/scan/index.ts` 按候选路径依次查找，源码形态回落到 `server/scan-worker.ts`。这段回落只在测试/直接跑源码时生效，构建形态始终命中同目录的 `scan-worker.js`。

## 前端接线

### body 与样式

- `cordis-app` 构建项目前端时固定使用 Vite 的 `react()`、`bodyPlugin` 与 `importMapPlugin()`；`bodyPlugin` 只把 `virtual:cordis-app/body` 换成项目的 `src/body.tsx`。项目没有注入 Vite 插件的入口，因此不能直接加 `@tailwindcss/vite`。
- 采用的做法：`pnpm css` 调用 Tailwind CLI，把 `src/styles.tailwind.css` 编译成 `src/styles.generated.css`（已 gitignore）。`src/styles.css` 先 `@import` 生成物，再补 `html/body/#root` 的高度；`src/body.tsx` 导入 `src/styles.css`。
- 样式只保留视频/收藏页实际使用的语义 token（background、card、primary、selection、hover、destructive、warning 等），浅色/深色值对齐 `frontend/src/style.css`；框架 `restoreAppearance()` 写的是 `data-theme`，所以深色变体也按这个属性声明。
- body 自己画侧边栏和四个路由（`/`、`/favorites`、`/settings`、`/plugins`），不渲染插件的页面出口、slot 或设置面板。

### auth 与 `/api`

- 框架壳启动时用 `bootstrapToken()` 从 URL 的 `#token=` 取 token，存进 `sessionStorage` 的 `cordis-app/token`，随后把 hash 抹掉。项目代码通过 `useRuntime()` 拿到 `runtime.token`。
- `/api/*` 的请求统一走 `runtime.http`：它自动加 `Authorization: Bearer <token>`，非 2xx 抛 `HttpError`。`src/shared/api.ts` 的 `createApiClient(runtime.http)` 把 spaces、videos、directories、settings、native 包成带类型的 `ApiClient`，并把所有错误归一为 `{ code, message }`；原生失败也是这个形状（`POST /api/native` 以 HTTP 200 返回 `{ ok: false, code, message }`）。
- 播放调用 `POST /api/native` 的 `shell.openPath`（入参 `{ path }`），成功后再 `PUT /api/videos/:id/played`；失败提示会区分 `unsupported`，并给出「复制路径」。

### 扫描事件

- 框架客户端 `connect()` 只负责 `default` 频道的重连通知，不把业务消息交给 body。扫描进度由 body 自己开一条 WebSocket：`/__ws?channel=scan&token=<token>`（浏览器的 WebSocket 构造器不能设请求头，所以 token 放在查询串）。
- `src/shared/scanEvents.ts` 惰性建立这一条连接，兼容裸事件与框架 `{ type, data }` 信封，按 `spaceId` 过滤；`ScanDialogHost` 在 body 层全局挂载，挂载时用 `GET /api/scan/status` 补状态，收到终态后关闭对话框。
- 扫描期间空间命令由后端拒绝（409 `space.blocked.scanning`），暂停与取消请求也占用扫描槽。

## 已知回退（相对旧 Tauri 版）

- 没有任务页与任务队列；没有跨重启恢复与后台任务。
- 没有共享清单与共享服务。
- 没有自动更新、更新检查与下载。
- 没有历史页。
- 没有自绘标题栏、贴靠布局、托盘、深链接、多窗口、窗口位置记忆。
- 扫描回到模态 dialog，终态自动关闭；空间在扫描期间锁定。
- FFmpeg/ffprobe 不随包分发，需要用户自备。
- 旧 Rust 数据库的导入或迁移不在第一版范围内。

## 已知问题

- 本地 `file:` 依赖下的开发模式（`pnpm dev` / `pnpm dev:shell`）中，Vite 的依赖预构建会额外打入一份 React，浏览器报 `Invalid hook call` 与 `useContext of null`，页面空白。生产构建（`pnpm build` + `pnpm start`）不受影响；等待框架侧修复。
- `dev:shell` 在 `file:` 依赖下的外壳与 supervisor 定位见上文，需要 `CORDIS_APP_SHELL` 并从 `cordis-app` 仓库根启动。

## 坑

- **cordis-app 改动后要重新 `pnpm install`。** pnpm 10 对目录 `file:` 依赖使用硬链接而不是软链接：原地覆盖已有文件能被看到，但新增文件或新增构建产物不会自动出现在 `node_modules/.pnpm` 里。改完框架先 `pnpm build`，再回本目录 `pnpm install`（必要时 `pnpm install --force`）。
- `pnpm install` 可能提示 `Ignored build scripts: esbuild@...`。这不影响构建；如果遇到 esbuild 平台二进制问题再执行 `pnpm approve-builds`。
- 不要在本目录引入 `package-lock.json`；本目录只使用 pnpm。
