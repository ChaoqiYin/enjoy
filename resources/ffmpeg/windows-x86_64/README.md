# Windows x64 媒体工具

将下载的 LGPL 静态构建解压，把 `bin/ffmpeg.exe` 和 `bin/ffprobe.exe` 放到本目录，
把该构建的 LGPL 许可证正文复制为 `LICENSE.txt`，保留其余版权声明和来源信息。
目录结构：

```text
windows-x86_64/
├── README.md
├── ffmpeg.exe
├── ffprobe.exe
└── LICENSE.txt
```

推荐来源及版本核对方法见 [下载资料](../../../docs/FFmpeg-LGPL下载-资料核对.md)。
当前配置面向静态构建；若使用 shared 构建，必须同时放入其配套 DLL。

运行 `npm exec tauri build` 构建 Windows 安装包；缺少上述工具或许可证时，发布构建会失败。
Tauri 将本目录复制到安装资源目录的 `resources/ffmpeg/windows-x86_64/`。
发布版通过绝对路径调用内置工具。开发版优先使用本目录的完整工具对，缺少时使用 PATH。
`npm run build` 仅构建前端页面，不生成桌面安装包。

二进制及 DLL 在 Git 中忽略，需在本机和打包机器上准备；许可证及来源说明可随仓库保存。
分发时保留实际构建对应的许可证、源码获取方式、版本与构建信息。
