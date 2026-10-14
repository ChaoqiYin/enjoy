# 仓库贡献指南

## 设计文档

产品范围、软件架构、技术选型、环境与依赖版本、界面约定、数据模型、处理流程及打包要求，统一参见[本地视频统一启动器开发基线](docs/本地视频统一启动器-开发基线.md)。开发前阅读相关章节，设计变更同步更新该文档，不在本指南重复维护。

## 开发指南

所有贡献者和自动化代理在修改仓库前，必须阅读并遵守[开发指南](docs/开发指南.md)。指南按主题拆成六份，索引在那份里；**每一次改动之前先读 `docs/guides/编码与架构.md`**（编码规范、导入规则、文件行数限制、架构设计），其余按手头的事读对应的一份：

- 改按钮、提示、通知、选择框或页面装配 → `docs/guides/界面约定.md`
- 改四个列表页的布局、渲染或滚动 → `docs/guides/列表与滚动.md`
- 写测试、跑检查、用网页验收 → `docs/guides/测试与检查.md`
- 搭环境、起应用、查日志、排启动问题 → `docs/guides/开发与启动.md`
- 发版、换图标 → `docs/guides/构建与发布.md`

## Agent skills

### Issue tracker

任务与规格使用 GitHub Issues；读写任务前阅读 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认分诊标签；分诊或修改标签前阅读 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context 布局；探索领域概念或架构前阅读 `docs/agents/domain.md`。
