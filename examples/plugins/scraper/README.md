# javbus 刮削插件

一个同时拥有**界面半**和**运行体**的插件：从视频右键菜单触发入队，由后台实例 `run` 抓取 JavBus 并将字段写回任务结果。

## 怎么编

```sh
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

产物在 `target/wasm32-unknown-unknown/release/scraper.wasm`。

## 怎么装

把 `.wasm` 与 `plugin.json` 放进目录 `scraper/`，复制到应用数据目录下的 `plugins/`：

- macOS：`~/Library/Application Support/<应用的 bundle id>/plugins/`
- Windows：`%APPDATA%\\<应用的 bundle id>\\plugins\\`
- Linux：`~/.config/<应用的 bundle id>/plugins/`

启用后视频右键菜单会出现「javbus 刮削」。

## 设置

在插件页填入：

- 站点地址（默认 `https://www.javbus.com`）
- Cookie（可选，多行）

设置会保存在插件私有目录（`storage`）中，后台实例会读取后再抓取。

## 行为要点

- 右键触发：前台只入队任务 `{"path": "..."}` 并返回空，不做网络请求。
- 番号识别：只认「字母+数字」，形如 `ABC-123`；认不出则任务终态失败（`无法从文件名识别番号`）。
- 抓取顺序：`/{number}` → `/search/{number}` → `/uncensored/search/{number}`。
- 请求需带 `User-Agent`、`Referer`、`Accept-Language: zh-CN,zh;q=0.9`、Cookie（如有）。
- 限速：每次请求间隔 ≥ 1.5 秒。
- 重试：网络错误、5xx、429 最多重试 3 次，退避 1/5/15 分钟（由宿主 `task_fail` 调度）。
- 验证墙/登录墙：视为终态并提示需 Cookie 或通过验证。
- 字段：仅交 `title,number,actors,genres,studio,label,series,director,releaseDate,duration,rating,plot`，多值用 `, `，空则不交。
- 封面：优先从详情页大图（`/pics/cover/*_b.jpg` 或 `/imgs/cover/*_b.jpg`）获取地址交回。

## 备注

- 未引入 `wasm-bindgen`，沿用裸 wasm 导出（`alloc`/`handle`/`memory`）及 `enjoy` 导入。
