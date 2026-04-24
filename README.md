# Open WebUI Desktop

[![Version](https://img.shields.io/github/v/release/open-webui/desktop?label=version&color=%2331c48d)](https://github.com/open-webui/desktop/releases)
[![Downloads](https://img.shields.io/github/downloads/open-webui/desktop/total?color=%23764abc)](https://github.com/open-webui/desktop/releases)
[![Discord](https://img.shields.io/discord/1170866489302188073?label=discord&color=%235865F2)](https://discord.gg/open-webui)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

![Open WebUI Desktop](./demo.png)

Your AI, right on your desktop. [Open WebUI](https://github.com/open-webui/open-webui) as a native app. Run models locally or connect to any server. No Docker, no terminal, no setup. Download, launch, chat.

> [!WARNING]
> **Early Alpha.** Things move fast and stuff might break. [Report bugs](https://github.com/open-webui/desktop/issues) or [come hang out on Discord](https://discord.gg/open-webui).

## Download

| Platform | Installer |
|----------|-----------|
| macOS (Apple Silicon) | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-arm64.dmg) |
| macOS (Intel) | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-x64.dmg) |
| Windows x64 | [**Download .exe**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-setup.exe) |
| Linux (AppImage) | [**Download .AppImage**](https://github.com/open-webui/desktop/releases/latest/download/open-webui.AppImage) |
| Linux (Debian/Ubuntu) | [**Download .deb**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.deb) |
| Linux (Snap) | [**Download .snap**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.snap) |
| Linux (Flatpak) | [**Download .flatpak**](https://github.com/open-webui/desktop/releases/latest/download/open-webui.flatpak) |

Internet required on first launch. After that, everything works offline. [All releases →](https://github.com/open-webui/desktop/releases)

## How It Works

🖥️ **Run locally.** The app runs Open WebUI on your machine. You can optionally enable the built-in llama.cpp engine to download and run models offline. Nothing leaves your computer.

☁️ **Connect remotely.** Point the app at any Open WebUI server. Switch between multiple connections from the sidebar.

Use both at the same time.

## Highlights

- ⚡ **Spotlight.** Hit `Shift+Cmd+I` (macOS) or `Shift+Ctrl+I` (Windows/Linux) to summon a floating chat bar over whatever you're doing. Drag to screenshot anything on screen.
- 🎙️ **Voice input.** System-wide push-to-talk. Press the shortcut from any app to record, and your speech is transcribed and sent to your chat automatically.
- 🧠 **Local inference.** Optionally run models entirely on your hardware via the built-in llama.cpp engine. Your data never leaves your machine.
- 🎯 **One-click setup.** Launch and connect to a server in seconds. Local models can be enabled from the settings.
- 🔌 **Multiple connections.** Juggle servers and switch between them instantly.
- 🔄 **Auto-updates.** New releases land in the background.
- 📡 **Offline-ready.** No internet needed after initial setup.
- 💻 **Cross-platform.** macOS, Windows, and Linux.

## System Requirements

|  | Local Models | Remote Only |
|--|-------------|-------------|
| **Disk** | 5 GB+ | ~500 MB |
| **RAM** | 16 GB+ | 4 GB |
| **OS** | macOS 12+, Windows 10+, modern Linux | Same |

> [!NOTE]
> Local models need serious RAM (7B ≈ 8 GB, 13B ≈ 16 GB). Lighter machine? Connect to a remote server instead.

## Privacy

No telemetry. No tracking. No phone-home. Your conversations stay on your machine. Period.

## Community

- 💬 [Discord](https://discord.gg/open-webui) - Come hang out
- 🐛 [Issues](https://github.com/open-webui/desktop/issues) - Report bugs or request features
- 🌐 [Open WebUI](https://github.com/open-webui/open-webui) - The main project
- 📖 [Docs](https://docs.openwebui.com) - Full documentation

## Contributing

```bash
npm install
npm run dev
```

See [CHANGELOG.md](CHANGELOG.md) for release history. Licensed under [AGPL-3.0](LICENSE).
