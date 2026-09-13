# Domain docs

## 布局与阅读规则

本仓库采用 single-context：

- 根目录 CONTEXT.md：领域术语与概念。
- docs/adr/：架构决策记录。

探索代码前阅读已有的 CONTEXT.md，
并阅读与当前任务相关的 ADR。

文件尚不存在时直接继续；
由 domain-modeling 在术语或决策明确后按需创建。

产品范围与软件设计以 docs/本地视频统一启动器-开发基线.md 为准，
开发约束以 docs/开发指南.md 为准。
CONTEXT.md 聚焦领域术语，ADR 记录决策背景、取舍及结果；
引用现有文档，避免重复维护。设计变化同步更新开发基线。

## 术语与决策

Issue、设计建议、诊断假设和测试名称使用 CONTEXT.md 定义的术语。
发现术语缺口时，记录给 domain-modeling 后续完善。

建议与既有 ADR 冲突时，明确指出相关 ADR、冲突内容及重新讨论的理由。
