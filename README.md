# Enjoy

本地视频库桌面客户端：扫描目录、浏览视频、生成缩略图，并通过系统默认播放器打开视频。

## 开发

在仓库根目录执行 `npm ci` 安装依赖，执行 `npm run desktop` 启动桌面应用。

- `npm run dev`：启动网页开发服务。
- `npm test`：运行前端测试。
- `npm run check`：检查源码规范、翻译和格式。
- `npm run build`：构建前端到 `frontend/dist/`。
- `npm exec tauri build`：构建桌面应用。

完整环境要求、后端验证命令和网页验收方式见[开发指南](docs/开发指南.md)。

## 目录职责

| 目录 | 用途 |
| --- | --- |
| `frontend/src/app/` | 应用组合及跨组件测试 |
| `frontend/src/features/library/` | 视频库组件、状态逻辑及测试 |
| `frontend/src/i18n/` | 界面语言初始化、同步及设置 |
| `frontend/src/shared/` | 前端通信接口、通用组件及格式化 |
| `frontend/acceptance/` | 独立网页验收入口与模拟数据 |
| `frontend/public/` | 网页运行时静态资源 |
| `src-tauri/` | Rust 原生工程、权限、图标及打包配置 |
| `shared/locales/` | 前后端共享翻译资源 |
| `assets/brand/` | 品牌制作素材及图标源图 |
| `scripts/` | 仓库检查、开发服务与资源生成脚本 |
| `docs/` | 设计基线、开发指南与验收记录 |

根目录维护统一 npm 命令、依赖和锁文件。前端配置位于 `frontend/`，桌面配置位于 `src-tauri/`。构建产物及依赖目录由工具生成，不提交到仓库。

产品范围和架构约定见[开发基线](docs/本地视频统一启动器-开发基线.md)。
