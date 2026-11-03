# Enjoy

本地视频库桌面应用。当前版本用 cordis-app 重写：Go 外壳 + Node worker，项目 server 是一个 cordis 插件，界面是 React 19。

工作区里只有一个应用：`app/`。旧的 Tauri + Rust 实现已移除，仍可从 git 历史中查阅。

## 快速开始

前置：

- Node.js 24 与 pnpm
- `ffmpeg` 与 `ffprobe`（或在环境变量 `ENJOY_FFMPEG` / `ENJOY_FFPROBE` 中给出路径）
- 与本仓库同级的 [cordis-app](../cordis-app) 源码检出（`cordis/package.json` 用 `file:../../cordis-app` 引入）

```sh
cd app
pnpm install
pnpm css
pnpm dev          # 浏览器开发
pnpm dev:shell    # 桌面外壳
```

完整命令、已知回退与打包说明见 [app/README.md](app/README.md)，设计见 [重写方案](docs/本地视频统一启动器-cordis重写-第一版.md)。

## 仓库结构

| 路径 | 内容 |
| --- | --- |
| `app/` | 应用本体：server、React 界面、测试与构建脚本 |
| `docs/` | 重写方案与代理流程文档 |
| `assets/brand/` | 品牌素材 |
| `CONTEXT.md` | 领域术语 |

## 许可证

MIT，见 [LICENSE](LICENSE)。
