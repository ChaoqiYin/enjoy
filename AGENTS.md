# 仓库贡献指南

本仓库现在只有一个应用：`app/`——用 cordis-app 重写的 Enjoy 本地视频库。旧的 Tauri + React 实现已从工作区移除，需要查阅时见 git 历史。

## 先读什么

- 产品范围、架构、数据模型、扫描流程与已知回退：[重写方案](docs/本地视频统一启动器-cordis重写-第一版.md)
- 安装、启动、测试、构建与打包：[app/README.md](app/README.md)
- 领域术语：[CONTEXT.md](CONTEXT.md)

编码规范以 `app/` 现有代码为准：改动前先读相邻模块，保持同样的命名、注释密度与导入顺序。

## 常用命令

在 `app/` 下执行：

```sh
pnpm css           # 生成 Tailwind 样式（首次与样式改动后）
pnpm test          # 后端 node:test + 前端 vitest
pnpm build         # 生成 dist/
pnpm check:source  # 源码约束检查（行数、静态导入、冲突标记等）
```

`cordis-app` 以本地 `file:` 依赖引入，路径是 `../../cordis-app`；改动框架源码后需先在那里重新构建。

## Agent skills

### Issue tracker

任务与规格使用 GitHub Issues；读写任务前阅读 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认分诊标签；分诊或修改标签前阅读 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context 布局；探索领域概念或架构前阅读 `docs/agents/domain.md`。
