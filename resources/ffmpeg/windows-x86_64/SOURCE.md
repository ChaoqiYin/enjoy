# FFmpeg 构建来源

- 放入日期：2026-09-13。
- 来源：用户下载的 `ffmpeg-n9.0-latest-win64-lgpl-9.0` 解压目录。
- 构建方：[BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)。
- 下载入口：https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-lgpl-9.0.zip
- 本地运行版本：`n9.0.1-29-gad500d59cb-20260912`。
- 编译器：`gcc 16.2.0 (crosstool-NG 1.29.0.7_b1a94f6)`。
- `ffmpeg -L` 与 `ffprobe -L` 均报告 LGPL v3 或更新版本；原包许可证保存在 `LICENSE.txt`。
- `ffmpeg -version` 可查看完整编译参数；已核对启用 `--enable-version3`，未启用 `--enable-gpl` 或 `--enable-nonfree`。

## 本地文件 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| ffmpeg.exe | E50359DB4A15DE57B5F744F330573B9C7364ED6B4F98A992B4FD5FB54C015B5C |
| ffprobe.exe | A8C1E6B5C130AF6ED18E1963E5B5A602796F8B848155A82F728BF791BA99A58A |

以上哈希由移入项目的文件计算，用于后续比对；未与发布方签名或校验清单独立比对。
下载入口为滚动版本，后续内容可能不同。构建脚本及依赖来源见 BtbN 仓库，
FFmpeg 源码见 https://github.com/FFmpeg/FFmpeg 。正式分发时保留与此二进制对应的源码及构建材料。

## 发布附件

本目录的两个可执行文件不入库，改为随仓库 `ffmpeg-tools` 发布附件分发：`ffmpeg.exe` 与 `ffprobe.exe`，标记为预发布，不占据仓库的 Latest 位置——自动更新端点解析 `releases/latest`，工具包不能落在那里。`LICENSE.txt` 随仓库保存，不由附件提供。

两份文件取自下载入口的压缩包 `ffmpeg-n9.0-latest-win64-lgpl-9.0.zip`（170,475,943 字节，SHA-256 `3f7d058e3592aa3394d252648a3edc35db89f5e8851fc23d9cb0db756fefd10a`）。上游该入口为滚动版本，因此附件按可执行文件逐份发布，同一标签下不替换附件；更换工具时另起标签，使构建与所用工具保持对应。
