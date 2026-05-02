# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.16] - 2026-05-02

### Fixed

- **Links Open in Default Browser.** Clicking links in chat responses now opens them in the user's default browser instead of navigating within the app or spawning a new Electron window (#165).

## [0.0.15] - 2026-04-28

### Added

- **ARM64 Support for Linux and Windows.** Native ARM64 builds are now produced for Linux (.deb, AppImage) and Windows (NSIS installer), enabling support for Raspberry Pi, NVIDIA DGX Spark, Snapdragon laptops, and other ARM64 devices (#140).

### Fixed

- **Grey/Blank Screen on Linux.** Disabled GPU compositing entirely on Linux to prevent shared memory allocation crashes that caused a grey or blank screen on systems with restricted `/dev/shm` or `/tmp` permissions.
- **Spotlight Dismiss Behavior.** Pressing Escape or the toggle shortcut to dismiss Spotlight no longer erroneously brings the main application window to the foreground (#158).

## [0.0.14] - 2026-04-28

### Fixed

- **Grey/Blank Webview on Linux.** Disabled GPU compositing on Linux to prevent silent compositor failures that produce a grey rectangle instead of rendered content on systems with problematic Intel/NVIDIA drivers or certain Wayland compositors (#119).
- **Renderer Crash Recovery.** The main window now automatically reloads when the renderer process dies unexpectedly, preventing a permanent blank/grey screen.
- **Webview Crash Diagnostics.** Added logging for guest webview renderer crashes to aid debugging connectivity and rendering issues.
- **macOS Notarization.** Resolved Apple notarization failure caused by an expired Developer Program agreement, restoring signed and notarized macOS builds.

## [0.0.13] - 2026-04-27

### Fixed

- **Copy Button on Linux (GNOME/Wayland/Flatpak).** Fixed the "Copy" button in the Open WebUI interface not actually writing to the system clipboard on Linux. The webview session was missing the `clipboard-sanitized-write` permission required by Electron for `navigator.clipboard.writeText()` to work.

## [0.0.12] - 2026-04-25

### Added

- **Toggleable Clipboard Auto-Paste for Spotlight.** Spotlight's automatic clipboard pasting is now optional and can be toggled in Settings, so the input bar starts empty when preferred.
- **Persistent Window Size and Position.** The app now remembers your window dimensions, position, and maximized state across restarts, with safe fallback when a saved display is disconnected.

### Fixed

- **Linux .deb Crash.** Fixed app failing to launch on Linux with `Failed to load native module: pty.node` by enabling native module rebuilds and unpacking node-pty from the asar archive during packaging.
- **Grey Screen on Connection Failure.** The webview now shows an error overlay with retry and open-in-browser options instead of a blank grey screen when a connection fails to load or crashes.
- **Global Shortcuts on Wayland/Flatpak.** Global shortcuts now work on Wayland desktops via `xdg-desktop-portal`, with clear user-facing notifications when a shortcut cannot be registered.

## [0.0.11] - 2026-04-24

### Fixed

- **macOS Launch Crash.** Fixed app failing to launch with "different Team IDs" error by adding the missing `disable-library-validation` entitlement to the build signing configuration.
- **Self-Signed SSL Connections.** The app now trusts all SSL certificates, allowing connections to Open WebUI instances behind self-signed or untrusted certificates without errors.

## [0.0.10] - 2026-04-24

### Added

- **Concurrent Model Downloads.** Multiple Hugging Face models can now be downloaded simultaneously, each with independent progress tracking and per-file cancel buttons.

### Changed

- **Models Settings UI.** Cleaner layout with inline progress bars, hover-reveal download buttons, and breadcrumb-style repo navigation.

### Fixed

- **GPU Process Crash Recovery.** The app now automatically detects GPU process crashes (common with certain NVIDIA/Intel drivers on Windows) and relaunches with the GPU sandbox disabled, instead of closing immediately. No manual shortcut edits required.

## [0.0.9] - 2026-04-20

### Fixed

- **Open Terminal API Key Persistence.** The Open Terminal API key is now saved in config.json and reused across restarts instead of being regenerated on every startup, which was breaking existing integrations.

## [0.0.8] - 2026-04-11

### Added

- **Voice Input.** System-wide push-to-talk voice transcription. Press the shortcut from any app to record audio, which is automatically transcribed and sent to your active chat.
- **Voice Input Settings.** Configurable global hotkey and enable/disable toggle in Settings, with a default of Shift+Cmd+Space (macOS) or Shift+Ctrl+Space (Windows/Linux).
- **Audio Feedback.** Bundled start and stop chime sounds play when recording begins and ends.

### Fixed

- **Shortcut Recorder on macOS.** Shortcut inputs now use physical key codes instead of character values, fixing Alt key combinations producing unicode characters like √ instead of V.

## [0.0.7] - 2026-04-11

### Fixed

- **macOS Auto-Update.** Auto-update now works correctly on macOS. Previously, the updater tried to download a zip file with a versioned filename that did not exist in the release.

## [0.0.6] - 2026-04-10

### Added

- **Spotlight Screenshot Capture.** Drag anywhere on the Spotlight overlay to select a region of your screen. Screenshots appear as inline thumbnails and are sent alongside your message.
- **Multiple Screenshots.** Attach several screenshots in a single Spotlight query. Each one can be individually removed before sending.
- **Click-to-Dismiss Spotlight.** Clicking the background outside the input bar dismisses Spotlight, in addition to pressing Escape.
- **Screen Recording Permission Prompt (macOS).** If screen capture permission hasn't been granted, a notification guides you to the correct System Settings page.
- **Screenshot Hint.** A "Drag anywhere to capture a screenshot" hint appears when Spotlight opens.
- **Offline Mode for llama.cpp.** Previously downloaded llama.cpp binaries are automatically detected on startup, so local models work without an internet connection.
- **Auto-Connect on Startup.** The app pre-connects to your default connection when launched, so Spotlight queries work immediately.

### Changed

- **Fullscreen Spotlight Overlay.** Spotlight now opens as a fullscreen transparent overlay on your active display rather than a small floating window, enabling screenshot capture and multi-display support.
- **Faster Remote Connections.** Switching to a remote server is now instant with no loading delay.
- **Smarter Loading Indicator.** The loading spinner only appears when the local server is actually starting, instead of showing on every connection switch.
- **Clearer Sidebar Selection.** Active connections are more visually distinct with bolder text and stronger highlights. Inactive connections are subtler for better contrast.
- **Safer llama.cpp Updates.** The app verifies internet connectivity before removing the current installation, preventing accidental data loss when updating offline.

### Fixed

- **Tray Menu Connections.** Clicking a connection from the system tray menu now correctly opens it in the app.
- **Dark Mode Context Menus.** Sidebar right-click menus no longer appear incorrectly highlighted in dark mode.
- **Local Server Always Accessible.** The local connection in the sidebar is no longer grayed out when the server isn't running. Clicking it will start the server.
- **Open Terminal Install Errors.** If automatic installation of Open Terminal fails, you now see a clear error message instead of a silent failure.
- **Network Timeout Handling.** Requests for llama.cpp releases now time out after 10 seconds instead of hanging indefinitely on slow networks.

## [0.0.5] - 2026-04-07

### Added

- **Two-Way Theme Sync.** Theme changes in Open WebUI are now mirrored to the desktop app and vice versa, so your light/dark preference stays consistent everywhere.
- **Seamless Spotlight Queries.** Spotlight prompts now appear directly in your already-open chat without triggering a full page reload.

### Fixed

- **Auto-Default Connection.** Selecting a connection now automatically saves it as your default for Spotlight and app startup.
- **Smooth Connection Switching.** Switching between already-open connections no longer causes unnecessary page reloads.
- **Connection Switch Race Condition.** Clicking a remote connection while the local server is still starting no longer gets overridden when the local server finishes loading.

## [0.0.3] - 2026-04-06

### Fixed

- **Spotlight Focus.** Spotlight now reliably appears after interacting with the main window. Previously could fail to show on macOS.
- **Spotlight Search Passthrough.** Searches submitted from Spotlight now correctly load in already-open connections instead of being silently ignored.

## [0.0.2] - 2026-04-06

### Added

- **Spotlight Input Bar.** Lightweight quick-chat bar (⇧⌘I) for submitting queries without opening the full app.
- **Spotlight Shortcut.** Dedicated configurable shortcut for Spotlight, independent from the global app shortcut.
- **Draggable Spotlight.** Spotlight bar can be dragged to any position on screen.
- **Persistent Spotlight Position.** Spotlight position is saved and restored across app restarts.
- **Spotlight Settings.** Shortcut recorder in Settings → General for the Spotlight shortcut.

### Fixed

- **System Theme Sync.** The app now responds to OS dark/light mode changes in real-time when set to "Auto". Previously only checked once at startup.

## [0.0.1] - 2026-03-20

### Added

- **Local Server Management.** Install, start, stop, and restart Open WebUI directly from the desktop app.
- **Connection Manager.** Connect to multiple Open WebUI servers with sidebar quick-switch.
- **Status Bar.** Real-time status indicators for Open WebUI, Open Terminal, and llama.cpp services.
- **Log Viewer.** Live terminal log viewer for all services with copy, refresh, and resize.
- **Open Terminal Integration.** Built-in terminal server for AI-powered shell access.
- **llama.cpp Integration.** Local inference engine with model management and Hugging Face downloads.
- **Settings.** General, Open WebUI, Terminal, Inference, Models, Connections, and About panels.
- **Global Shortcut.** Configurable system-wide hotkey to bring the app to the foreground.
- **Auto-Update.** Built-in update checker with one-click download and install.
- **Tray Support.** System tray icon with quick actions and optional background mode.
- **Factory Reset.** One-click removal of all installed components, data, and connections.
- **Disk Space Check.** Pre-install check requiring at least 5 GB of free storage.
- **Internationalization.** English, Japanese, Chinese (Simplified & Traditional) translations.
- **In-App Changelog.** Accessible from the About settings page.
- **Cross-Platform.** macOS, Windows, and Linux support.
