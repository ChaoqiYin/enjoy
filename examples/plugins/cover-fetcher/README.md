# 爬封面插件

一个只有**运行体**的插件：在视频上右键触发，去一个页面上找到这张视频的封面，把图片地址交回内核，内核下载后写进 `$APPDATA/covers/`。

它同时是运行体（Rust → wasm32）的第一份作者样板：`wasm/fixture.rs` 里的模块是宿主作者自己写的，证明不了这套 ABI 作者写得出来；这一份能。它注册的挂载点、被交给什么、要交回什么，只读 [插件挂载点目录](../../../docs/插件挂载点目录.md) 一处。

## 怎么编

```sh
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

产物在 `target/wasm32-unknown-unknown/release/cover_fetcher.wasm`。

**不引入 `wasm-bindgen`**：运行体接口是裸 wasm 导出（`alloc` / `handle` / `memory`）加 `enjoy` 下的五个导入，见 [ADR 0044](../../../docs/adr/0044-运行体是常驻的-WASM-实例.md)。

## 怎么装

把 `.wasm` 与 `plugin.json` 放进一个目录，**目录名必须是清单里的 `id`**（这里是 `cover-fetcher`），整个目录复制到应用数据目录下的 `plugins/`：

- macOS：`~/Library/Application Support/<应用的 bundle id>/plugins/`
- Windows：`%APPDATA%\\<应用的 bundle id>\\plugins\\`
- Linux：`~/.config/<应用的 bundle id>/plugins/`

下次启动时内核读到它，插件页里出现一行「Cover Fetcher」，启用后视频的右键菜单多一项「Cover Fetcher」。在插件页里填一个页面地址（`{name}` 会被换成视频的文件名，不带扩展名），之后每在一条视频上触发一次，就去那个页面找一次封面。

## 怎么验收（真机）

1. 编译出上面的 `cover_fetcher.wasm`，把它和 `plugin.json` 一起放进应用数据目录的 `plugins/cover-fetcher/`。
2. 启动应用，打开插件页，启用「Cover Fetcher」，在它的设置里填一个能回答图片的页面地址。
3. 在任意一条视频上点右键 → 选「Cover Fetcher」。内核会去抓、下载、写进 `$APPDATA/covers/<video id>.<ext>`，封面在卡片上随即出现；详情里相应的插件字段标出由「Cover Fetcher」提供。

## 改它

- `plugin.json`：声明了 `fetch` 与 `log` 两项能力。
- `src/cover.rs`：只做最小的正则式式的标签查找，不引 HTML 解析库。
- `src/host.rs`：wasm 导出与导入那一层，唯一调用点是 `lib.rs`。