# Open WebUI Desktop

![Open WebUI Desktop](./demo.png)

Your AI, right on your desktop. **Open WebUI Desktop** wraps the full [Open WebUI](https://github.com/open-webui/open-webui) experience into a native app you can install in seconds, with no Docker, terminal, or manual setup required. Just download, launch, and start chatting with local or remote models.

> [!NOTE]
> Open WebUI Desktop is in **early alpha**. Things are moving fast and we'd love your feedback! Drop into the [Discord](https://discord.gg/5rJgQTnV4s) or open an issue if you hit a snag.

## Download

Grab the installer for your platform and you're good to go. An internet connection is needed the first time you launch; after that the app works fully offline.

### macOS

| Chip | Installer |
|------|-----------|
| Apple Silicon | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-arm64.dmg) |
| Intel | [**Download .dmg**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-x64.dmg) |

### Windows

| Architecture | Installer |
|--------------|-----------|
| x64 | [**Download .exe**](https://github.com/open-webui/desktop/releases/latest/download/open-webui-setup.exe) |

### Linux

| Format | Installer |
|--------|-----------|
| AppImage | [**Download .AppImage**](https://github.com/open-webui/desktop/releases/latest/download/open-webui.AppImage) |
| Debian / Ubuntu | [**Download .deb**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.deb) |
| Snap | [**Download .snap**](https://github.com/open-webui/desktop/releases/latest/download/open-webui_amd64.snap) |
| Flatpak | [**Download .flatpak**](https://github.com/open-webui/desktop/releases/latest/download/open-webui.flatpak) |

> Looking for an older version? Check the [releases page](https://github.com/open-webui/desktop/releases).

## Highlights

- **One-click setup.** Open WebUI and all its dependencies install automatically, no terminal required.
- **Spotlight quick-chat.** Press `⇧⌘I` to pop up a lightweight input bar and fire off a prompt from anywhere on your desktop.
- **Local inference.** The built-in llama.cpp integration lets you download and run models directly on your machine.
- **Connect anywhere.** Point the app at any remote Open WebUI server, or run one locally and switch between connections in the sidebar.
- **Offline-ready.** After the first launch, everything runs without an internet connection.
- **Cross-platform.** Available for macOS (Apple Silicon + Intel), Windows, and Linux.
- **Auto-updates.** New releases are detected and installed automatically.

## System Requirements

| | Minimum |
|--|---------|
| **Disk** | 5 GB free space |
| **OS** | macOS 12+, Windows 10+, or a modern Linux distro |
| **RAM** | 8 GB recommended (more is better for local models) |

## Contributing

Want to hack on the desktop app? Here's how to get a dev build running:

```bash
# Install dependencies
npm install

# Start the dev server with hot-reload
npm run dev
```

### Building for production

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

## License

This project is licensed under **AGPL-3.0**. See [LICENSE](LICENSE) for details.

## Community

We'd love to have you around! Star the repo, join the [Discord](https://discord.gg/5rJgQTnV4s), or follow [Open WebUI on GitHub](https://github.com/open-webui/open-webui) for the latest updates.
