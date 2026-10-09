# Enjoy

English / [简体中文](README_CN.md)

[![Checks](https://github.com/ChaoqiYin/enjoy/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/ChaoqiYin/enjoy/actions/workflows/check.yml)

**Bring videos from different folders into one library, ready to browse and play.**

Enjoy is a local video library desktop app built with Tauri, React, and Rust. Add your folders to browse thumbnails, search files, save favorites, and launch videos in your system's default player.

Your video index and thumbnails stay on your machine. No separate server is required.

[Quick Start](#quick-start) · [Usage](#usage) · [Documentation & Support](#documentation--support) · [Contributing](#contributing)

## Features

- **Multiple spaces**: Keep several independent libraries, each with its own folders, video records, favorites, and playback history, and switch between them at any time. One space is shown at a time.
- **One video library**: Add multiple folders to the current space and recursively scan common video formats: MP4, MKV, AVI, MOV, WEBM, M4V, MPG, MPEG, and WMV.
- **Thumbnails and details**: Generate thumbnails and extract duration, resolution, codec, and other metadata.
- **Find videos quickly**: Search by filename, filter by folder, sort your collection, and revisit favorites or recently played videos.
- **Open and play**: Click a card to open its details, or use the play button to launch the default player. Open the containing folder when you need the original file.
- **Keep your library current**: Rescan manually after files are added, moved, or removed, and rebuild thumbnails. Pause, resume, or cancel processing tasks.
- **Share to other devices**: Mark videos for sharing and start a built-in read-only WebDAV service, then browse and play them from a television, tablet, or phone on the same network.
- **Smooth browsing**: A responsive card grid uses virtual scrolling to render only items near the visible area.
- **Make it yours**: Choose English, Simplified Chinese, or the system language, with light, dark, and system theme options.
- **Stay up to date (Windows)**: Check for a new version in Settings and download it in the app. The download can be paused, resumed, or cancelled, and Enjoy restarts to finish installing it.

## Quick Start

You can currently run Enjoy from source, build a local package, or install the published Windows build from the [releases page](https://github.com/ChaoqiYin/enjoy/releases). Builds and runtime behavior have been validated on macOS; full Windows and Linux validation is still pending.

### Prerequisites

| Dependency         | Requirement and purpose                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Node.js            | 22 LTS, for the frontend toolchain                                                                                          |
| npm                | 11, for dependency installation and project commands                                                                        |
| Rust               | stable, for compiling the desktop backend                                                                                   |
| System build tools | Install the dependencies for your platform using the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) |
| FFmpeg and FFprobe | Bundled in the Windows installer; otherwise it must be on the app process's `PATH`                                           |
| Video player       | Install a player that supports your files and configure the system's file associations                                      |
| WebDAV client      | Only for sharing: install one on the device you share to (many televisions have one built in)                               |

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

1. Enjoy opens in one **space**. Create, rename, or delete spaces in Settings, and switch between them from the switcher in the navigation bar. Each space keeps its own folders, video records, favorites, and playback history.
2. Open the library, select **Add folder**, and choose one or more video folders for the current space, then start scanning.
3. Browse cards as the initial index becomes available. Metadata and thumbnails fill in as processing continues.
4. Use search, folder filters, and sorting to find videos, or save favorites for later.
5. Select a card's play icon to open the video in your default player.
6. Use Settings to manage spaces and folders, rebuild thumbnails, and change the language or theme. On Windows, Settings also checks for and downloads app updates.

### Sharing to Other Devices

Sharing serves the videos you pick as a read-only WebDAV library over your local network.

1. Add videos to the share list from the right-click menu in the library, favorites, or recently played pages.
2. Open **Sharing** in the navigation bar and select **Start sharing**.
3. On the other device, add a WebDAV source using one of the addresses the page shows, with the user name `enjoy` and the four-digit password.

- The service is read-only: a client can browse and play the shared videos, and nothing on disk can be renamed, deleted, or replaced through it.
- Only the current space's share list is served. Switching space or quitting Enjoy ends the service, and a running service asks for confirmation first.
- **Recently active devices** lists the clients that asked for a video in the last minute. A WebDAV client connects, takes what it came for, and disconnects, so the list shows what has just been here rather than what is playing now.
- Editing the share list while the service is running does not change what it is serving; restart sharing to publish the new list.
- The password is a four-digit PIN sent as plain HTTP Basic authentication. It keeps out devices that were not told about the service, not one that is trying addresses, and not anything that can read the traffic on your network.

### Files and Playback History

- Removing a video from the library index does not delete the original file. If that video is on the share list, removing the index takes it off the list as well.
- Deleting a space erases its folders, video records, favorites, and playback history. The video files on disk are not touched.
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

Error notifications in the app show a reference ID. What that ID stands for is written to `enjoy.log` in the application data folder, beside the library database (`enjoy.db`); the file rotates once it passes 4 MiB.

## Development

The frontend uses React, TypeScript, Tailwind CSS, and daisyUI. Tauri 2 and Rust provide desktop capabilities, SQLite stores the video index, FFmpeg and FFprobe handle media processing, and a built-in read-only WebDAV server provides sharing over the local network.

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
