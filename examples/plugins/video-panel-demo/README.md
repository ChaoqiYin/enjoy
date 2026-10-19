# 视频面板示例插件

第二份样板：同样只有**插件界面**，但注册的是另一处界面类挂载点——不往顶部导航加页面，
而是往**一条视频的详情**里加一块。

一份插件界面能注册的只有 `app.page` 与 `video.panel` 两处，[最小示例插件](../hello-page/)
演示前一处、这份演示后一处，其余四处归运行体那一半（这个插件没有那一半）。

它同时也是**契约目录的使用示例**——它注册的那个挂载点是什么、被交给什么、要交回什么，
只有 [插件挂载点目录](../../../docs/插件挂载点目录.md) 一处可读，那份文件由
`shared/plugins/mount-points.json` 生成。

## 怎么用

把这个目录整个复制到应用数据目录下的 `plugins/`：

- macOS：`~/Library/Application Support/<应用的 bundle id>/plugins/`
- Windows：`%APPDATA%\<应用的 bundle id>\plugins\`
- Linux：`~/.config/<应用的 bundle id>/plugins/`

下次启动时内核就会读到它，插件页里出现一行「Video panel demo」，点开任意一条视频的详情，
里面多出一块写着这条视频路径的文字。**目录名必须是清单里的 `id`**：内核靠 id 再找到这个
插件，而磁盘上重名的目录只有一个。

## 改它

- `plugin.json` 是清单，四个必填字段（`id`／`name`／`author`／`apiVersion`）加可选的两半
  （`interface`／`body`）。两半至少要有一个，两个都没有的插件内核没法问它任何东西。
  目录名与 `id` 必须一致，能力只能声明允许的那几项。
- `interface.js` 是插件界面这一半的入口。它是**原样**被加载的，前面没有构建步骤：
  所以它不 `import` 任何东西，React 从内核交给它的 baseline 上取。
- `context.draw` 的第二个参数里那个 `key` 是插件给这一块起的名字，在同一个挂载点上不能
  重名——`app.page` 与 `video.panel` 都有这条规矩。

## 这个目录里没有什么

没有构建、没有依赖、没有打包。一个插件就是一个目录。
