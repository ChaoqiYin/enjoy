# Enjoy

English / [简体中文](README_CN.md)

[![Checks](https://github.com/ChaoqiYin/enjoy/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/ChaoqiYin/enjoy/actions/workflows/check.yml)

**Bring videos from different folders into one library, ready to browse and play.**

Enjoy is a local video library desktop app built with Tauri, React, and Rust. Add your folders to browse thumbnails, search files, save favorites, and launch videos in your system's default player.

Your video index and thumbnails stay on your machine. No separate server is required.

[Quick Start](#quick-start) · [Usage](#usage) · [Documentation & Support](#documentation--support) · [Contributing](#contributing)

## Features

- **One video library**: Add multiple folders and recursively scan common video formats, including MP4, MKV, AVI, MOV, and WEBM.
- **Thumbnails and details**: Generate thumbnails and extract duration, resolution, codec, and other metadata.
- **Find videos quickly**: Search by filename, filter by folder, sort your collection, and revisit favorites or recently played videos.
- **Open and play**: Click a card to open its details, or use the play button to launch the default player. Open the containing folder when you need the original file.
- **Keep your library current**: Watch folders for added or removed files, rescan manually, and rebuild thumbnails. Pause, resume, or cancel processing tasks.
- **Smooth browsing**: A responsive card grid uses virtual scrolling to render only items near the visible area.
- **Make it yours**: Choose English, Simplified Chinese, or the system language, with light, dark, and system theme options.

## Quick Start

You can currently run Enjoy from source or build a local package. Builds and runtime behavior have been validated on macOS; full Windows and Linux validation is still pending.

### Prerequisites

| Dependency         | Requirement and purpose                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Node.js            | 22 LTS, for the frontend toolchain                                                                                          |
| npm                | 11, for dependency installation and project commands                                                                        |
| Rust               | stable, for compiling the desktop backend                                                                                   |
| System build tools | Install the dependencies for your platform using the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) |
| FFmpeg and FFprobe | Bundled in the Windows installer; otherwise it must be on the app process's `PATH`                                           |
| Video player       | Install a player that supports your files and configure the system's file associations                                      |

The Windows installer bundles FFmpeg and FFprobe, so no separate installation is needed there. On other platforms, and when running from source, install them using the options on the [FFmpeg download page](https://ffmpeg.org/download.html), then verify them in your terminal:

```sh
ffmpeg -version
ffprobe -version
```

### Run the Desktop App

```sh
git clone https://github.com/ChaoqiYin/enjoy.git
cd enjoy
npm ci
npm run desktop
```

The first launch compiles the Rust backend, which may take a while depending on your machine. Development mode starts or reuses the project's Vite server, then opens the desktop window.

### Build a Local Package

Run from the repository root:

```sh
npm exec tauri build
```

Packages are generated in `src-tauri/target/release/bundle/`. The packaged app includes the frontend and does not need Vite at runtime.

A Windows release build needs `ffmpeg.exe`, `ffprobe.exe` and `LICENSE.txt` in `resources/ffmpeg/windows-x86_64/` and fails without them. `LICENSE.txt` is tracked by Git; the two executables are not, and the release workflow fetches them from the repository's `ffmpeg-tools` release. To package locally, place a matching pair there first, as described in the [media tools notes](resources/ffmpeg/windows-x86_64/README.md). The Windows installer bundles all three, so an installed app does not rely on `PATH`.

## Usage

1. Open the library, select **Add folder**, choose one or more video folders, and start scanning.
2. Browse cards as the initial index becomes available. Metadata and thumbnails fill in as processing continues.
3. Use search, folder filters, and sorting to find videos, or save favorites for later.
4. Select a card's play icon to open the video in your default player.
5. Use Settings to manage folders, rebuild thumbnails, and change the language or theme.

### Files and Playback History

- Removing a video from the library index does not delete the original file.
- If a file is moved or its folder becomes inaccessible, the interface shows no marker; opening the video reports a localized error.
- Recently played records successful requests to open a video, including their time and count. It does not confirm that you watched the video or track playback progress inside the player.
- Video details show metadata beyond the card view. Errors appear as floating notifications, with a retry action when supported.

## Documentation & Support

The detailed project documentation is currently in Simplified Chinese.

- [Development Guide](docs/开发指南.md): Environment setup, commands, coding standards, UI conventions, and validation procedures.
- [Design Baseline](docs/本地视频统一启动器-开发基线.md): Product scope, architecture, data model, and processing workflows.
- [Implementation Review](docs/逐项完成审查.md): Completed validation and outstanding acceptance checks.
- [Validation Log](docs/开发验收进度.md): Verification records and screenshots from development.
- [GitHub Issues](https://github.com/ChaoqiYin/enjoy/issues): Report bugs or suggest features. Include your operating system version, reproduction steps, and any error reference ID.

## Development

The frontend uses React, TypeScript, Tailwind CSS, and daisyUI. Tauri 2 and Rust provide desktop capabilities, SQLite stores the video index, and FFmpeg and FFprobe handle media processing.

| Directory         | Purpose                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `frontend/`       | Pages, components, frontend configuration, static assets, and browser acceptance fixtures |
| `src-tauri/`      | Rust backend, system integrations, window permissions, and packaging configuration        |
| `shared/locales/` | English and Chinese translations shared by the frontend and backend                       |
| `assets/brand/`   | Brand assets and source artwork for the app icon                                          |
| `scripts/`        | Repository checks, development server tools, and asset generation                         |
| `docs/`           | Design documents, development guidelines, and validation records                          |

Run all commands from the repository root:

| Command                                           | Purpose                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| `npm run desktop`                                 | Start the desktop development environment              |
| `npm run dev`                                     | Start the frontend development server                  |
| `npm run check`                                   | Check source conventions, translations, and formatting |
| `npm test`                                        | Run frontend tests                                     |
| `npm run build`                                   | Check TypeScript and build the frontend                |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Run backend tests                                      |

To inspect the UI in a browser, run `npm run dev` and open the [browser acceptance page](http://127.0.0.1:5173/acceptance/web-acceptance.html). It uses mock data rather than your real library. Playback deliberately returns an error so notifications and retry interactions can be checked. Use the desktop app for full local functionality.

See the [Development Guide](docs/开发指南.md) for additional formatting, static analysis, media integration testing, and packaging commands.

## Contributing

Bug reports, suggestions, code, and translations are welcome.

Before contributing, read the [repository guidelines](AGENTS.md) and [Development Guide](docs/开发指南.md). Describe the problem your change addresses and how you verified it. Include screenshots for UI changes and update the relevant documentation when the design changes.

Translations live in `shared/locales/`. Run `npm run check` after editing them to verify that translation keys and interpolation parameters match across languages.

Keep the English and Chinese READMEs in sync when changing the project description, features, or setup instructions.
