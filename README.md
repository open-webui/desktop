# Open WebUI Desktop

[![Version](https://img.shields.io/github/v/release/open-webui/desktop?label=version&color=%2331c48d)](https://github.com/open-webui/desktop/releases)
[![Downloads](https://img.shields.io/github/downloads/open-webui/desktop/total?color=%23764abc)](https://github.com/open-webui/desktop/releases)
[![Discord](https://img.shields.io/discord/1170866489302188073?label=discord&color=%235865F2)](https://discord.gg/open-webui)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

![Open WebUI Desktop](./demo.png)

A desktop installer and launcher for [Open WebUI](https://github.com/open-webui/open-webui). Install and run Open WebUI on your computer without Docker or command-line setup.

> [!WARNING]
> **Early Alpha.** Things move fast and stuff might break. [Report bugs](https://github.com/open-webui/desktop/issues) or [come hang out on Discord](https://discord.gg/open-webui).

## Download

| Platform | Installer |
|----------|-----------|
| macOS (Apple Silicon) | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-arm64.dmg) |
| macOS (Intel) | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-x64.dmg) |
| Windows x64 | [**Download .exe**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-x64-setup.exe) |
| Windows ARM64 | [**Download .exe**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-arm64-setup.exe) |
| Linux x64 (AppImage) | [**Download .AppImage**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_x64.AppImage) |
| Linux x64 (Debian/Ubuntu) | [**Download .deb**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.deb) |
| Linux x64 (Snap) | [**Download .snap**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.snap) |
| Linux x64 (Flatpak) | [**Download .flatpak**](https://github.com/open-webui/desktop/releases/latest/download/open-webui.flatpak) |
| Linux ARM64 (AppImage) | [**Download .AppImage**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_arm64.AppImage) |
| Linux ARM64 (Debian/Ubuntu) | [**Download .deb**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_arm64.deb) |

Internet is required for installation and updates. [All releases →](https://github.com/open-webui/desktop/releases)

## How It Works

Install Open WebUI from the launcher. Open WebUI Desktop starts it, manages it in the background, and opens it in the app.

Desktop focuses on installing and launching Open WebUI locally. Hosted-server connections and companion workflows belong in [Open WebUI Tether](https://github.com/open-webui/tether).

## Highlights

- **Local installation.** Install and update Open WebUI from the app.
- **Cross-platform.** macOS, Windows, and Linux.

## System Requirements

| | Requirements |
|--|-------------|
| **Disk** | 5 GB+ |
| **OS** | macOS 12+, Windows 10+, modern Linux (glibc 2.28+) |

## Privacy

Desktop does not add telemetry. Installation and updates require network access; external providers configured inside Open WebUI have their own data handling policies.

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
