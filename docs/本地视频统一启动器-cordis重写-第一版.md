# 本地视频统一启动器 · cordis-app 重写 · 第一版设计

本文是第一版重写的实施方案。它只回答一件事：**用 cordis-app 把现有 Enjoy 的视频管理、收藏、设置三页做出来**，并把视频扫描与缩略图生成从任务队列改回同步 dialog 的呈现方式。插件体系不在这一版。

事实基线：cordis-app `b04f1f9`（含 `ctx.native`、`shell.openPath`、`dev --shell` 与脚本重构）。框架仍在演进，实施前应重新核对这个 commit 之后的变化。

## 0. 范围与关键决策

### 第一版做

- Go 外壳 + cordis-app worker/body，替换 Tauri 外壳与 Rust 后端。
- 视频管理页（列表、筛选、排序、分页、播放、在文件夹中显示）。
- 收藏页。
- 设置页：外观（语言、主题、仓库链接）、空间管理、目录管理（扫描、全部重建缩略图）。
- SQLite 数据层，沿用现有表语义。
- 扫描以模态 dialog 呈现：进度、暂停、继续、取消。
- 扫描期间恢复旧的空间锁。
- 原生能力经 `ctx.native` 提供；浏览器模式有降级分支。

### 第一版不做

- 任何应用插件（不写示例插件、不渲染 `app.page` / `video.panel`、不做插件设置与安装）。
- 任务页、任务队列、`tasks` 表、跨重启恢复。
- 共享清单、自动更新、历史页。
- 自绘标题栏、贴靠布局、托盘、深链接、多窗口、窗口位置记忆。

### 决策表

| 编号 | 决策 |
| --- | --- |
| Q1 | 文件消失照旧删除记录；不可达目录与“不是目录”的记录保留 |
| Q2 | 扫描：`POST /api/scan` + WS 进度 + `POST /api/scan/:id/cancel` + `GET /api/scan/status` |
| Q3 | 扫描在 `worker_threads` 里跑，主线程只转发进度 |
| Q4 | 第一版没有任何应用插件 |
| Q5 | 恢复旧空间锁：扫描槽被占时四个空间命令一律拒绝 |
| Q6 | 自定义 body，带 Enjoy 的 Tailwind + shadcn；宿主组件包一层套 Enjoy token |
| Q7 | 托盘、深链接、多窗口、自绘标题栏、窗口位置记忆、自动更新都不做 |
| Q8 | 开发与原生验收用 `dev --shell`；`start` 只做产物冒烟；前端写降级分支 |
| Q9 | `app.json.ui` 全部关闭；插件入口由项目自己的只读分区提供 |
| Q10 | 设置页保留“插件”分区，显示“暂无插件”，不提供安装 |
| Q11 | 扫描 dialog 保留暂停 / 继续 / 取消 |

## 1. 总体架构

```
Go 外壳（webview_go）
  │ fork + stdout 握手
  ▼
supervisor（Node）
  │ 分配端口、生成会话 token、fork worker、退出码 75 原地重启
  ▼
worker（Node）
  ├─ cordis 内核 + 内置插件：server / auth / router / static / ws / storage
  ├─ 项目 server（server/index.ts）：路由、SQLite、扫描编排、原生能力代理
  ├─ scan worker thread：目录遍历、ffprobe/ffmpeg、SQLite 写入
  └─ ctx.native ──回环 HTTP──▶ Go 外壳 native server
  ▼
浏览器 / 外壳窗口
  └─ 项目 body（React）：三页 + 扫描 dialog + 设置
```

页面只通过 HTTP + WS 调 worker；原生能力由 worker 的 `ctx.native` 转发给外壳。页面永远拿不到原生 token。

## 2. 项目布局

```
<project>/
├── package.json
├── app.json                  ui 全部关闭，plugins 为空
├── src/
│   ├── body.tsx              自定义布局与路由
│   ├── pages/                Library / Favorites / Settings / Plugins（只读）
│   └── shared/               API 适配层、查询、i18n、UI 组件
├── server/
│   ├── index.ts              apply(ctx)：路由、扫描编排、原生代理
│   ├── scan-worker.ts        独立入口，worker_threads 加载
│   ├── db.ts                 node:sqlite 连接与迁移
│   ├── scan/                 目录遍历、媒体处理、控制字
│   └── native.ts             ctx.native 白名单代理
├── scripts/
│   └── build-scan-worker.mjs 第二入口构建（若框架未支持多入口）
├── data/                     由 cordis-app 管理
└── .cordis/                  runtime、日志、dev 产物
```

`app.json`：

```json
{
  "name": "Enjoy",
  "version": "0.1.0",
  "plugins": []
}
```

不写 `ui` 字段。body 不渲染 `PluginPageOutlet`、`PluginSlot`、`SettingsPanel`；插件入口是项目自己的只读页面。

## 3. 数据层

### 3.1 驱动与连接

- `node:sqlite` 的 `DatabaseSync`，不引入原生 `.node`，绕开 cordis-app 的打包限制。
- 主线程与扫描线程各开一个连接；数据库启用 `PRAGMA journal_mode = WAL` 与 `PRAGMA busy_timeout = 5000`。
- 主线程负责读与短写；扫描线程负责批量写。写冲突由 `busy_timeout` 与有限重试处理。
- 数据库文件放在 cordis-app 的 `data/` 下，路径由项目 server 决定；缩略图缓存放在数据库同级的 `thumbnails/`。

### 3.2 表

沿用现有 schema，去掉 `tasks`：

- `spaces`
- `videos`（含 `favorite`、`play_count`、`last_played_at`）
- `directories`
- `directory_videos`
- `video_fields`（第一版保留结构，不写入）
- `plugin_settings`（第一版保留结构，不写入）

迁移版本从 1 开始重新编号；不追求兼容旧 Rust 版的数据库文件。第一版启动时若发现旧库，提示用户新建数据目录，或提供一次性导入（不在第一版）。

### 3.3 文件消失

沿用 `replace_videos_controlled` 的语义：

- `Found::Read`：目录可读，按本次结果增删该目录的记录。
- `Found::Gone`：目录已不存在，删除它名下全部记录。
- `Found::Unreachable` / `Found::NotADirectory`：记录保留，不参与删除。
- 删除视频行时，`video_fields`、收藏、播放历史随行删除；不弹确认。

## 4. 扫描

### 4.1 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/scan` | 启动扫描，body `{ spaceId }`，返回 `{ scanId }` |
| `GET` | `/api/scan/status?spaceId=` | 当前扫描状态；无扫描时 `{ active: false }` |
| `POST` | `/api/scan/:id/pause` | 暂停 |
| `POST` | `/api/scan/:id/resume` | 继续 |
| `POST` | `/api/scan/:id/cancel` | 取消 |
| `POST` | `/api/thumbnails/rebuild` | 全部重建缩略图，body `{ spaceId }`，复用同一套 dialog 与状态 |

WS 频道 `scan`，消息形状：

```json
{
  "scanId": "…",
  "spaceId": 1,
  "phase": "discovering | indexing | metadata | thumbnails | paused | done | cancelled | failed",
  "changes": { "added": 0, "updated": 0, "removed": 0 },
  "failures": 0,
  "unreachableDirectories": 0,
  "discovered": 0,
  "processed": 0,
  "indexed": 0,
  "metadataReady": 0,
  "thumbnailsReady": 0,
  "currentPath": ""
}
```

前端按 `spaceId` 过滤。`GET /api/scan/status` 用于 WS 断线重连后补齐状态。

### 4.2 执行

- 主线程创建 `ScanSession`：`scanId`、`spaceId`、`SharedArrayBuffer` 控制字、状态对象、`Worker`。
- 控制字：`0` 运行、`1` 暂停、`2` 取消。主线程用 `Atomics.store` + `Atomics.notify`；扫描线程在 checkpoint 用 `Atomics.wait` 挂起。
- 扫描线程按阶段执行：读目录 → 差量写库 → 媒体处理（ffprobe/ffmpeg）→ 写缩略图。
- 每个阶段通过 `parentPort.postMessage` 推进度；主线程更新状态并广播 WS。
- 扫描线程结束时发 `{ type: 'done' | 'cancelled' | 'failed', changes }`；主线程释放槽、广播终态。
- 同一时刻只允许一个扫描或缩略图重建（一个 `ScanSession`）。

### 4.3 空间锁

恢复旧语义：扫描槽被占（运行、暂停、取消请求中、缩略图重建）时，以下命令一律返回 `space.blocked.scanning`：

- `create_space`
- `rename_space`
- `delete_space`
- `switch_space`

前端把空间选择器与设置页空间区显示为不可用并说明原因。锁是后端的规则，前端只是解释。

### 4.4 缩略图

- ffprobe：`ffprobe -v error -select_streams v:0 -show_streams -show_format -of json <path>`，30 秒超时。
- ffmpeg：`ffmpeg -nostdin -v error -y -i <path> -map 0:v:0 -frames:v 1 -vf scale=480:-2 -q:v 3 <temporary>`，60 秒超时。
- 缓存目录：数据库同级 `thumbnails/`，文件名 `{videoId}-{modifiedAt}-{revision}.jpg`，先写临时文件再改名。
- 扫描时缓存文件仍在就跳过；重建命令忽略缓存，全部重新生成。
- 单个文件失败只增加 `failures`，不中断整次扫描。ffprobe/ffmpeg 不存在时扫描照样完成：需要工具的每个文件计入 `failures`，不为每个文件启动进程。
- FFmpeg/ffprobe 路径：打包形态用绝对路径，从项目资源目录或环境变量读取；开发形态允许 `PATH` 查找。第一版要求用户自备 FFmpeg，设置页显示检测结果。

### 4.5 构建：扫描线程的第二入口

cordis-app 的 `serverPreset` 目前只接受一个入口，`buildProjectServer` 只打包 `server/index.ts`。扫描线程需要第二个产物。两个方案：

- **推荐**：给 cordis-app 的项目构建加“`server/` 多入口”能力——除 `index` 外的 `server/*.ts` 各自打包到 `dist/server/<name>.js`，`dev` 的 watcher 同样处理。改动集中在 `packages/ui/src/build/index.ts` 与 CLI 的 dev 构建，属于通用能力。
- **备选**：项目根加 `scripts/build-scan-worker.mjs`，在 `cordis-app build` 之后用 `serverPreset` 打包 `server/scan-worker.ts`；`dev` 模式需要同等处理，容易与框架的 watcher 漂移。

第一版优先走推荐方案；如果不想动框架，再退回备选。

扫描线程用 `new Worker(new URL('./scan-worker.js', import.meta.url))` 加载。ESM 下 `import.meta.url` 指向 `dist/server/index.js`，同目录的 `scan-worker.js` 可解析。

## 5. API 清单

项目 server 的 `/api` 路由，全部经过 cordis-app 的 auth：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/spaces` | 空间列表 |
| `POST` | `/api/spaces` | 新建空间 |
| `PUT` | `/api/spaces/:id` | 重命名 |
| `DELETE` | `/api/spaces/:id` | 删除 |
| `POST` | `/api/spaces/:id/switch` | 切换当前空间 |
| `GET` | `/api/videos` | 分页、筛选、排序 |
| `GET` | `/api/videos/:id` | 单条详情 |
| `PUT` | `/api/videos/:id/favorite` | 收藏/取消 |
| `PUT` | `/api/videos/:id/played` | 记录播放 |
| `GET` | `/api/directories` | 目录列表 |
| `POST` | `/api/directories` | 添加目录 |
| `DELETE` | `/api/directories/:id` | 删除目录 |
| `GET` | `/api/scan/status` | 扫描状态 |
| `POST` | `/api/scan` | 启动扫描 |
| `POST` | `/api/scan/:id/pause` | 暂停 |
| `POST` | `/api/scan/:id/resume` | 继续 |
| `POST` | `/api/scan/:id/cancel` | 取消 |
| `POST` | `/api/thumbnails/rebuild` | 重建缩略图 |
| `POST` | `/api/native` | 原生能力代理（白名单） |
| `GET` | `/api/settings` | 读取应用设置 |
| `PUT` | `/api/settings` | 保存应用设置 |
| `GET` | `/api/plugins` | 只读插件列表（第一版为空） |

视频列表的筛选/排序/分页全部在后端完成，沿用 ADR 0016。

## 6. 前端

### 6.1 body 与路由

自定义 body，不使用 `DefaultBody`。布局沿用 Enjoy 的导航与页面框：

- `/`：视频管理页
- `/favorites`：收藏页
- `/settings`：设置页
- `/plugins`：只读插件页（显示“暂无插件”）

cordis-app 的 `usePath` / `navigate` 只支持无参数路径；分页、筛选、排序走查询参数或组件状态，不依赖路由参数。

### 6.2 页面复用

复用现有 React 页面组件与 hooks：

- `frontend/src/pages/LibraryPage.tsx`
- `frontend/src/pages/FavoritesPage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/features/library/useLibrary.ts`
- `frontend/src/features/library/listing.ts`
- `frontend/src/shared/` 下的 UI 组件、i18n、主题

替换的部分：

- `frontend/src/shared/api.ts` 的 Tauri `invoke` 改为 HTTP/WS 适配层；19 个引用 `@tauri-apps/api` 的文件逐个替换。
- 路由与导航适配 cordis-app 的 `usePath` / `navigate`。
- 原生能力调用改为 `POST /api/native`。
- 去掉任务页、共享菜单、更新入口、历史页。

### 6.3 扫描 dialog

恢复旧实现的结构（`PageFrame.tsx` 第 62–93 行的 `<dialog open>`）：

- 不可关闭的模态框。
- 进度：阶段、当前路径、已发现/已索引/元数据/缩略图计数、失败数、不可达目录数。
- 三个按钮：暂停 / 继续 / 取消。
- 扫描结束（完成、取消、失败）后关闭 dialog，刷新当前页；当前页超出范围时回到第一页。
- WS 断线重连后先 `GET /api/scan/status`，再继续订阅。

### 6.4 设置页

三块：

- `appearance`：语言、主题、仓库链接。去掉更新。
- `spaces`：空间列表、新建、重命名、删除；扫描期间禁用并说明原因。
- `folders`：目录列表、添加/删除、扫描、全部重建缩略图。
- `plugins`：只读，显示“暂无插件”，不提供安装。

应用设置存 SQLite 或独立 JSON，不放进 cordis-app 的 `config.json`（它是单文件浅合并、无命名空间，留给插件配置）。

### 6.5 原生能力的降级分支

项目 server 开 `POST /api/native`，只放行白名单：

- `path.chooseDirectory`
- `shell.openPath`
- `shell.showItemInFolder`
- `shell.openExternal`：设置页的「在 GitHub 打开」需要它；只接收 http(s) URL，浏览器模式没有外壳时退化为 `window.open`
- `notification.show`
- `window.setTitle` / `window.setSize` / `window.state`

前端按 envelope 的 `code` 分支：

| 动作 | 有外壳 | `unsupported` 时 |
| --- | --- | --- |
| 选目录 | 系统选择器 | 文本输入框，手填绝对路径 |
| 播放 | 系统默认播放器 | 提示“请用桌面应用打开”，提供复制路径 |
| 在文件夹中显示 | 文件管理器 | 隐藏菜单项 |
| 通知 | 系统通知 | 页面内 Toast |
| 窗口命令 | 生效 | 静默跳过 |

`unsupported` 是正常分支，不弹错误。

## 7. 原生能力与外壳

- 用 `ctx.native`，不写 Node 侧平台分支。
- `shell.openPath` 要求绝对路径且存在；播放前先确认文件仍在。
- `path.chooseDirectory` 同一时刻只允许一个，第二个返回 `busy`。
- 插件的原生权限不涉及（第一版没有插件）；项目 server 默认拥有全部命令。
- 窗口：系统标题栏，启动 1280×832，可用 `window.setSize` 调整；没有最小尺寸，用前端 CSS 兜底。
- 自绘标题栏（ADR 0039）与贴靠布局（ADR 0041）第一版放弃，这是已知功能回退。

## 8. 开发、构建与验收

| 场景 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install` |
| 构建 | `pnpm build` |
| 开发 + 原生能力 | `cordis-app dev --shell`（缺外壳时自动 `go build`，需要 Go 1.25） |
| 浏览器模式 | `cordis-app dev`（原生能力 `unsupported`） |
| 产物冒烟 | `cordis-app build && cordis-app start` |
| 桌面形态验收 | `pnpm package:desktop --project <项目> --out <目录>` |
| 框架测试 | `pnpm test`、`pnpm test:shell`、`pnpm test:desktop` |

测试重点：

- `node:sqlite` 迁移与分页查询。
- 扫描状态机：运行 → 暂停 → 继续 → 完成；运行 → 取消。
- 空间锁：四个命令在扫描槽被占时返回 `space.blocked.scanning`。
- 不可达目录不删除记录。
- 原生代理的白名单与 `unsupported` 分支。
- 前端 dialog 的三按钮与进度。

## 9. 与现有 Enjoy 的差异

| 项 | 现有 | 第一版 |
| --- | --- | --- |
| 外壳 | Tauri（Rust） | Go + webview_go |
| 后端 | Rust | Node（cordis-app worker） |
| 数据 | SQLite（Rust 驱动） | SQLite（`node:sqlite`） |
| 扫描 | 任务队列 + 状态条 | 模态 dialog + 后台线程 |
| 空间锁 | 已移除 | 恢复 |
| 任务页 | 有 | 无 |
| 共享清单 | 有 | 无 |
| 自动更新 | 有 | 无 |
| 自绘标题栏 / 贴靠 | 有 | 无（系统标题栏） |
| 托盘 / 深链接 / 多窗口 | 视现状 | 无 |
| 插件 | WASM 插件体系 | 无（框架出口关闭） |

## 10. 风险与未决

1. **扫描线程的第二入口**：cordis-app 目前只打包单个 server 入口。推荐改框架支持 `server/` 多入口；不改则项目侧要维护一份与 watcher 同步的构建脚本。
2. **`node:sqlite` 的状态**：Node 24 中仍需确认 stable/experimental 与 flag；如果不可用，退回 `better-sqlite3` 会与“不支持 `.node`”冲突，需要重新评估打包。
3. **Go 1.25 依赖**：`dev --shell` 自动编译外壳需要 Go 工具链；CI 不装 Go 时只能跑浏览器模式与 Node 测试。
4. **框架漂移**：cordis-app 在本设计形成期间连续新增了原生能力、`shell.openPath`、`dev --shell` 与脚本重构。实施前重新核对 commit 与 `NATIVE_CONTRACT_VERSION`。
5. **旧库导入**：第一版不做旧 Rust 库迁移；用户需要新建空间、重新扫描。
6. **FFmpeg 分发**：第一版要求用户自备；后续再做随包分发与路径探测。
