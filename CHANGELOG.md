# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-04-06

### Fixed

- **Spotlight Focus** — Spotlight now reliably appears after interacting with the main window or webview (fixed blur-during-show race condition on macOS)
- **Spotlight Query Passthrough** — The `?q=` search parameter from spotlight now correctly navigates already-open webviews instead of being silently ignored

## [0.0.2] - 2026-04-06

### Added

- **Spotlight Input Bar** — Lightweight quick-chat bar (⇧⌘I) for submitting queries without opening the full app
- **Spotlight Shortcut** — Dedicated configurable shortcut for the spotlight, independent from the global app shortcut
- **Draggable Spotlight** — Spotlight bar can be dragged to any position on screen
- **Persistent Spotlight Position** — Spotlight position is saved to config and restored across app restarts
- **Spotlight Settings** — Shortcut recorder in Settings → General for the spotlight shortcut


### Fixed

- **System Theme Sync** — App now listens for OS dark/light mode changes in real-time when set to "Auto" (previously only checked once at startup)

## [0.0.1] - 2026-03-20

### Added

- **Local Server Management** — Install, start, stop, and restart Open WebUI directly from the desktop app
- **Connection Manager** — Connect to multiple Open WebUI servers with sidebar quick-switch
- **Status Bar** — Real-time status indicators for Open WebUI, Open Terminal, and llama.cpp services
- **Log Panel** — Live PTY-backed terminal log viewer for all services with copy, refresh, and resize
- **Open Terminal Integration** — Built-in terminal server for AI-powered shell access
- **llama.cpp Integration** — Local inference runtime with model management and Hugging Face downloads
- **Settings** — General, Open WebUI, Terminal, Inference, Models, Connections, and About panels
- **Global Shortcut** — Configurable system-wide hotkey to bring the app to the foreground
- **Auto-Update** — Built-in software update checker with download and install
- **Tray Support** — System tray icon with quick actions and optional background execution
- **Factory Reset** — One-click removal of all installed components, data, and connections
- **Disk Space Check** — Pre-install validation requiring at least 5 GB of free storage
- **Internationalization** — i18n support with English, Japanese, Chinese (Simplified & Traditional) translations
- **Changelog Viewer** — In-app changelog accessible from the About settings page
- **Singleton Enforcement** — Prevents multiple instances of managed services from running simultaneously
- **Cross-Platform** — macOS, Windows, and Linux support
