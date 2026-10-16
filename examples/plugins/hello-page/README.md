# 最小示例插件

插件作者的第一份样板：一个只有**插件界面**的插件，往顶部导航加一个自己的页面。

它同时也是**契约目录的使用示例**——它注册的那个挂载点是什么、被交给什么、要交回什么，
只有 [插件挂载点目录](../../../docs/插件挂载点目录.md) 一处可读，那份文件由
`shared/plugins/mount-points.json` 生成。

## 怎么用

把这个目录整个复制到应用数据目录下的 `plugins/`：

- macOS：`~/Library/Application Support/<应用的 bundle id>/plugins/`
- Windows：`%APPDATA%\<应用的 bundle id>\plugins\`
- Linux：`~/.config/<应用的 bundle id>/plugins/`

下次启动时内核就会读到它，插件页里出现一行「Hello page」，顶部导航多一个「Hello」。
**目录名必须是清单里的 `id`**：内核靠 id 再找到这个插件，而磁盘上重名的目录只有一个。

## 改它

- `plugin.json` 是清单，四个必填字段（`id`／`name`／`author`／`apiVersion`）加可选的两半
  （`interface`／`body`）。两半至少要有一个，两个都没有的插件内核没法问它任何东西。
  目录名与 `id` 必须一致，能力只能声明允许的那几项。
- `interface.js` 是插件界面这一半的入口。它是**原样**被加载的，前面没有构建步骤：
  所以它不 `import` 任何东西，React 从内核交给它的 baseline 上取。

## 这个目录里没有什么

没有构建、没有依赖、没有打包。一个插件就是一个目录。
