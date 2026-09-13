# Issue tracker: GitHub

任务与规格存放在 ChaoqiYin/enjoy 的 GitHub Issues，使用 gh CLI 操作。
在仓库根目录执行命令，gh 根据 Git remote 确定仓库。

## 常用操作

- 创建：gh issue create --title "标题" --body-file <正文文件>
- 读取：gh issue view <number> --comments
- 列表：gh issue list --state open --json number,title,body,labels
- 评论：gh issue comment <number> --body-file <正文文件>
- 添加标签：gh issue edit <number> --add-label "<label>"
- 移除标签：gh issue edit <number> --remove-label "<label>"
- 关闭：gh issue close <number>

多行正文写入 UTF-8 临时文件，通过 --body-file 传入。
需要完整列表时使用分页或调整 --limit，避免把默认结果当作全部任务。

技能要求“发布到任务跟踪器”时，创建 GitHub Issue；
要求“获取相关任务”时，读取对应 Issue 的正文、标签和评论。

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub 的 Issue 与 PR 共用编号空间；编号类型不明确时，
先用 gh pr view <number> 判断，失败后再读取 Issue。

## Wayfinding

使用带 wayfinder:map 标签的 Issue 记录计划、决策和待确认事项。
具体任务作为子 Issue；不支持子 Issue 时，使用计划正文中的任务列表，
并在子任务正文写明 Part of #<map>。

子任务按类型使用 wayfinder:research、wayfinder:prototype、
wayfinder:grilling 或 wayfinder:task 标签。

依赖优先使用 GitHub 原生 Issue dependencies；
不可用时，在任务正文记录 Blocked by: #<number>。
全部阻塞任务关闭后，该任务才可领取。

按计划中的顺序选择无阻塞且未分配的任务，
通过 gh issue edit <number> --add-assignee @me 领取。
完成后记录结果、关闭任务，并把结论与链接补充到计划 Issue。
