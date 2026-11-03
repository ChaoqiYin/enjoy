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
pnpm dev              # 浏览器模式开发（原生能力为 unsupported）
pnpm dev:shell        # 带桌面外壳开发（需要 Go 1.25）
pnpm test             # 运行后端测试（node:test）
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

## 坑

- **cordis-app 改动后要重新 `pnpm install`。** pnpm 10 对目录 `file:` 依赖使用硬链接而不是软链接：原地覆盖已有文件能被看到，但新增文件或新增构建产物不会自动出现在 `node_modules/.pnpm` 里。改完框架先 `pnpm build`，再回本目录 `pnpm install`（必要时 `pnpm install --force`）。
- `pnpm install` 可能提示 `Ignored build scripts: esbuild@...`。这不影响构建；如果遇到 esbuild 平台二进制问题再执行 `pnpm approve-builds`。
- `app.json` 不声明 `ui`，`plugins` 为空。本单只建立骨架，三页界面与插件入口在后续任务实现。
- 不要在本目录引入 `package-lock.json`；本目录只使用 pnpm。
