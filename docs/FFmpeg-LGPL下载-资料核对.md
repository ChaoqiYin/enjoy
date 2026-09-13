# FFmpeg LGPL 下载资料核对

核对日期：2026-09-13。范围：Windows x64 开发环境的 FFmpeg / FFprobe 下载来源及构建变体；未下载或执行二进制。

## 推荐下载

当前 Windows x64 推荐使用 **BtbN 的 9.0 分支 LGPL 静态构建**：

- [直接下载 ffmpeg-n9.0-latest-win64-lgpl-9.0.zip](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-lgpl-9.0.zip)。
- [完整发布页](https://github.com/BtbN/FFmpeg-Builds/releases/tag/latest)。
- [同次发布的 SHA-256 校验清单](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256)。

FFmpeg 官网只提供源码，下载页将 BtbN 列为 Windows 预编译包提供方。BtbN 是第三方构建项目，并非 FFmpeg 官方直接发布的二进制。[来源 1、2]

上述包名已通过 GitHub Releases API 核实存在；核对时 `latest` 发布日期为 `2026-09-12T13:34:40Z`。`latest` 是滚动入口，下载时内容可能更新。文件名中的 `n9.0` 表示发行分支构建，不能据此当作固定的 `9.0.1` 原始发布包；实际版本以解压后的 `ffmpeg -version` 为准。[来源 2、3]

## 变体选择

| 变体 | 区别 | 对本项目的用途 |
| --- | --- | --- |
| `win64-lgpl` | 静态可执行程序，去除 GPL-only 依赖 | 当前通过子进程调用命令行工具，推荐此包 |
| `win64-lgpl-shared` | 同一 LGPL 依赖集合，包含 libav 系列共享库 | 需要共享库时使用；运行时保留配套 DLL |
| `win64-gpl` / `win64-gpl-shared` | 包含 GPL 依赖，如 libx264、libx265 | 不符合本项目发布基线中的 LGPL 构建选择 |
| `master` | 跟随 FFmpeg 开发分支 | 需要最新开发功能时再选 |

BtbN README 明确区分静态可执行程序与 `libav*` 共享库，`lgpl` 变体主要移除 libx264、libx265 等 GPL-only 库。这里的“静态”描述 FFmpeg 包内部的链接方式，并不意味着把 FFmpeg 链接进 Enjoy 的 Rust 程序。[来源 2]

可选的共享库包：[ffmpeg-n9.0-latest-win64-lgpl-shared-9.0.zip](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-lgpl-shared-9.0.zip)。[来源 3]

开发分支入口：[ffmpeg-master-latest-win64-lgpl.zip](https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip)。[来源 3]

## LGPL 版本及来源选择

FFmpeg 默认许可为 LGPL v2.1 或更高版本；启用 GPL 部分会改变整体许可，`--enable-version3` 则启用版本 3 许可。[来源 4、5]

**BtbN 的 `lgpl` 默认配置明确启用 `--enable-version3`，并选择 `COPYING.LGPLv3`。因此这里推荐的是 LGPL v3 构建，不应描述成 LGPL v2.1-only。** 若以后必须限定 LGPL v2.1，应另行选取或自行构建不要求版本 3 的依赖组合。[来源 5、6]

Gyan 下载页明确其 FFmpeg 构建使用 GPLv3；页面另提到的 LGPLv3 supplementary tools 不是这些 FFmpeg 构建。不能因官网同时推荐 Gyan，就将其 FFmpeg 包视为 LGPL。[来源 1、7]

未来将二进制随应用分发时，需按实际构建保留许可证、对应源码和构建信息；仅文件名含 `lgpl` 不能替代对最终分发包的核对。当前项目仍按开发指南使用本机工具。[来源 4、项目开发指南]

## 在本项目中使用

解压后，将含 `ffmpeg.exe` 和 `ffprobe.exe` 的 `bin` 目录加入开发进程的 `PATH`。在新终端中检查实际命中的程序、版本与许可：

```powershell
Get-Command ffmpeg, ffprobe
ffmpeg -version
ffmpeg -L
ffprobe -version
ffprobe -L
```

本项目使用 FFprobe 获取元数据、FFmpeg 生成 JPEG 缩略图；普通 Rust 测试不要求媒体工具，媒体集成验证命令为：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored
```

上述命令来自[开发指南](开发指南.md)；媒体处理及未来打包布局见[开发基线](本地视频统一启动器-开发基线.md)第 8、9 节。本次仅核对下载资料，没有改变运行方式或打包方案。

## 跨平台范围

BtbN 提供 Windows 和 Linux 构建，其 README 列出的 Linux 最低目标为 glibc 2.28、Linux 4.18；当前来源未提供可直接推荐的 macOS LGPL 构建。本次不将 Windows 包或未经许可核对的 macOS 包用于其他平台。macOS 发布时应单独核实构建来源、许可及架构，并按项目基线完成签名和公证。[来源 2、项目开发基线]

## 来源

1. [FFmpeg 官方下载页](https://ffmpeg.org/download.html)：官方只提供源码，以及 Windows / Linux / macOS 二进制来源入口。
2. [BtbN FFmpeg-Builds README](https://github.com/BtbN/FFmpeg-Builds/blob/master/README.md)：变体、目标平台、自动构建与保留策略。
3. [BtbN latest 发布 API](https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest)：核实包名、直接下载 URL 和发布元数据。
4. [FFmpeg 官方法律说明](https://ffmpeg.org/legal.html)：LGPL / GPL 条件及分发相关说明。
5. [FFmpeg LICENSE.md](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md)：`--enable-version3`、外部依赖与许可证变化。
6. [BtbN defaults-lgpl.sh](https://github.com/BtbN/FFmpeg-Builds/blob/master/variants/defaults-lgpl.sh)：`--enable-version3` 与 `COPYING.LGPLv3`；[win64-lgpl.sh](https://github.com/BtbN/FFmpeg-Builds/blob/master/variants/win64-lgpl.sh) 引用此配置。
7. [Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/)：FFmpeg 构建的 GPLv3 声明。
