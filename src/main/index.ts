// @ts-nocheck

import {
  app,
  shell,
  clipboard,
  nativeImage,
  nativeTheme,
  desktopCapturer,
  BrowserWindow,
  globalShortcut,
  Notification,
  Menu,
  ipcMain,
  Tray,
  dialog
} from 'electron'
import path, { join } from 'path'
import { readFile, statfs } from 'fs/promises'

import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  getLogFilePath,
  getConfig,
  getUserDataPath,
  getInstallDir,
  installPackage,
  installPython,
  isPackageInstalled,
  isPythonInstalled,
  getPackageVersion,
  uninstallPackage,
  isUvInstalled,
  openUrl,
  resetApp,
  setConfig,
  startServer,
  webuiService,
  uninstallPython,
  type AppConfig
} from './utils'

import {
  setupLlamaCpp,
  startLlamaCpp,
  llamaService,
  stopLlamaCpp,
  getLlamaCppInfo,
  getLlamaCppAssetName,
  checkLlamaCppUpdate,
  updateLlamaCpp,
  uninstallLlamaCpp
} from './utils/llamacpp'

import {
  listModels,
  downloadModel,
  deleteModel,
  cancelDownload,
  getModelsDir,
  searchModels,
  getRepoFiles
} from './utils/huggingface'

import { attachTerminal } from './process/terminalChannel'

import { initUpdater, checkForUpdates, downloadUpdate, installUpdate } from './updater'

import log from 'electron-log'
log.transports.file.resolvePathFn = () => getLogFilePath('main')

import icon from '../../resources/icon.png?asset'

import { existsSync, writeFileSync, unlinkSync } from 'fs'

if (process.platform === 'linux') {
  // Work around /dev/shm access failures in AppImage and other containerised
  // environments.  AppImage's FUSE mount can restrict child-process access to
  // /dev/shm even when --no-sandbox is set, causing FATAL crashes in the
  // Chromium zygote/renderer with "Unable to access(W_OK|X_OK) /dev/shm".
  // This flag tells Chromium to use /tmp for shared memory instead (#136).
  app.commandLine.appendSwitch('disable-dev-shm-usage')

  // Use the native Wayland backend when available instead of XWayland.
  // This is required for xdg-desktop-portal features like GlobalShortcuts
  // to work (the portal is enabled by default in Chromium 134+ / Electron 33+).
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

  // Force software GL rendering via SwiftShader.  The out-of-process GPU
  // crashes on Ubuntu 24.04+, certain Wayland compositors, and AppArmor-
  // restricted environments due to shared-memory allocation failures in
  // /dev/shm or /tmp (#119, #157).
  //
  // --disable-gpu kills the display compositor so <webview> guest surfaces
  // are never painted (#178).  --in-process-gpu breaks <webview> guest
  // compositing entirely (blank webviews on all Linux).
  //
  // SwiftShader keeps the GPU process out-of-process (required for
  // <webview> compositing) while using software rendering to avoid
  // driver-level crashes.
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'swiftshader')

  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

// ─── GPU Crash Recovery ─────────────────────────────────
// When the GPU process crashes fatally (common on certain NVIDIA/Intel
// driver + Windows combos), we write a marker file and relaunch with
// --disable-gpu-sandbox so the user doesn't have to manually edit
// shortcut properties. On the next launch the marker is detected and
// the switch is applied preemptively.

const gpuCrashMarkerPath = join(app.getPath('userData'), '.gpu-sandbox-disabled')
const gpuSandboxDisabled = existsSync(gpuCrashMarkerPath)

if (gpuSandboxDisabled) {
  log.info('GPU sandbox disabled due to previous GPU process crash')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

// Prevent Chromium from permanently blocking WebGL / 3-D APIs after
// repeated GPU process crashes within the same session.
app.disableDomainBlockingFor3DAPIs()

// ─── State ──────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuiting = false

let CONFIG: AppConfig | null = null

// ─── Global Shortcuts ───────────────────────────────────

/**
 * Try to register a single global shortcut.  Returns true on success.
 * On failure a user-facing notification is shown (unless `silent` is set).
 */
function tryRegisterShortcut(
  accel: string,
  label: string,
  callback: () => void,
  silent = false
): boolean {
  try {
    const ok = globalShortcut.register(accel, callback)
    if (ok) {
      log.info(`${label} shortcut "${accel}" registered`)
      return true
    }
    log.warn(`${label} shortcut "${accel}" could not be registered (returned false)`)
    if (!silent) {
      new Notification({
        title: label,
        body: `Could not register shortcut "${accel}". It may be in use by another application.`
      }).show()
    }
    return false
  } catch (error) {
    log.warn(`${label} shortcut "${accel}" registration threw:`, error)
    if (!silent) {
      new Notification({
        title: label,
        body: `Failed to register shortcut "${accel}". It may conflict with another application.`
      }).show()
    }
    return false
  }
}

const registerShortcuts = (globalAccel?: string): void => {
  globalShortcut.unregisterAll()

  // Global shortcut – bring main window to foreground
  if (globalAccel) {
    tryRegisterShortcut(globalAccel, 'Open WebUI', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        createMainWindow()
      }
    })
  }
}

// ─── Windows ────────────────────────────────────────────

const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const MIN_WINDOW_WIDTH = 360
const MIN_WINDOW_HEIGHT = 360
const BOUNDS_SAVE_DEBOUNCE_MS = 500
const MIN_VISIBLE_OVERLAP_PX = 100

/** Last known non-maximized bounds, used to preserve restore geometry. */
let lastNormalBounds: Electron.Rectangle | null = null

/** Debounced persistence of the current window geometry to config. */
let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null

function debounceSaveWindowBounds(win: BrowserWindow): void {
  if (boundsDebounceTimer) clearTimeout(boundsDebounceTimer)
  boundsDebounceTimer = setTimeout(() => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const bounds = maximized ? (lastNormalBounds ?? win.getNormalBounds()) : win.getBounds()
    setConfig({ windowBounds: bounds, windowMaximized: maximized }).catch((err) =>
      log.warn('Failed to save window bounds:', err)
    )
  }, BOUNDS_SAVE_DEBOUNCE_MS)
}

/**
 * Returns true when at least `MIN_VISIBLE_OVERLAP_PX` of the saved
 * rectangle would be visible on one of the connected displays.
 */
function isBoundsOnVisibleDisplay(bounds: { x: number; y: number }): boolean {
  const { screen } = require('electron')
  const targetPoint = { x: bounds.x + MIN_VISIBLE_OVERLAP_PX / 2, y: bounds.y + MIN_VISIBLE_OVERLAP_PX / 2 }
  const display = screen.getDisplayNearestPoint(targetPoint)
  const { x, y, width, height } = display.workArea
  return (
    bounds.x + MIN_VISIBLE_OVERLAP_PX > x &&
    bounds.x < x + width &&
    bounds.y + MIN_VISIBLE_OVERLAP_PX > y &&
    bounds.y < y + height
  )
}

function trackNormalBounds(win: BrowserWindow): void {
  if (!win.isDestroyed() && !win.isMaximized()) {
    lastNormalBounds = win.getBounds()
  }
}

function createMainWindow(show = true): void {
  const saved = CONFIG?.windowBounds
  const windowOpts: Electron.BrowserWindowConstructorOptions = {
    width: saved?.width ?? DEFAULT_WINDOW_WIDTH,
    height: saved?.height ?? DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: 10 },
    autoHideMenuBar: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform !== 'darwin'
      ? { titleBarOverlay: {
          height: 32,
          color: '#00000000',
          symbolColor: (CONFIG?.theme === 'dark' ||
            (CONFIG?.theme !== 'light' && nativeTheme.shouldUseDarkColors)) ? '#ffffff' : '#000000'
        } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  }

  // Restore position only when the saved location is still on a visible display
  // (e.g. an external monitor may have been disconnected since last session).
  if (saved?.x != null && saved?.y != null && isBoundsOnVisibleDisplay(saved)) {
    windowOpts.x = saved.x
    windowOpts.y = saved.y
  }

  mainWindow = new BrowserWindow(windowOpts)
  mainWindow.setIcon(icon)

  if (CONFIG?.windowMaximized) {
    mainWindow.maximize()
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  if (show) {
    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openUrl(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Persist window bounds on geometry changes ──
  const onBoundsChanged = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    trackNormalBounds(mainWindow)
    debounceSaveWindowBounds(mainWindow)
  }
  mainWindow.on('resize', onBoundsChanged)
  mainWindow.on('move', onBoundsChanged)
  mainWindow.on('maximize', onBoundsChanged)
  mainWindow.on('unmaximize', onBoundsChanged)

  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      if (CONFIG?.runInBackground === false) {
        isQuiting = true
        app.quit()
      } else {
        event.preventDefault()
        mainWindow?.hide()
      }
    }
  })
}

// ─── Tray ───────────────────────────────────────────────

const updateTray = () => {
  if (!tray || !CONFIG) return

  const canOpenInBrowser = webuiService.info.reachable && !!webuiService.info.url

  const trayMenuTemplate = [
    {
      label: 'Open WebUI',
      click: async () => {
        if (mainWindow?.isMinimized()) mainWindow.restore()
        mainWindow?.show()
        mainWindow?.focus()
        const result = await openLocalWebUI()
        if (result) sendToRenderer('server:open', result)
      }
    },
    {
      label: 'Open in Browser',
      enabled: canOpenInBrowser,
      click: () => {
        if (webuiService.info.reachable && webuiService.info.url) openUrl(webuiService.info.url)
      }
    },
    {
      label: 'Copy Address',
      enabled: canOpenInBrowser,
      click: () => {
        if (webuiService.info.reachable && webuiService.info.url) clipboard.writeText(webuiService.info.url)
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Open WebUI Desktop',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        isQuiting = true
        app.quit()
      }
    }
  ]

  const trayMenu = Menu.buildFromTemplate(trayMenuTemplate)
  tray?.setContextMenu(trayMenu)
}

// Launch only the managed local installation; legacy saved server URLs are never used.
const openLocalWebUI = async () => {
  if (!isPackageInstalled('open-webui')) return null
  if (!await startServerHandler()) return null
  return { url: webuiService.info.url }
}

// ─── Server Lifecycle ───────────────────────────────────

webuiService.subscribe((event) => {
  if (event.type !== 'state') return
  sendToRenderer('server:info', event.info)
  sendToRenderer('status:server', event.info.status)
  if (event.info.reachable) sendToRenderer('server:ready', { url: event.info.url })
  updateTray()
})

let registeredLlamaUrl: string | null = null
llamaService.subscribe((event) => {
  if (event.type !== 'state') return
  const info = event.info
  sendToRenderer('llamacpp:info', getLlamaCppInfo())
  sendToRenderer('status:llamacpp', info.status)
  const nextUrl = info.reachable ? info.url : null
  if (registeredLlamaUrl !== nextUrl) {
    if (registeredLlamaUrl) sendToRenderer('connections:openai', { action: 'remove', url: `${registeredLlamaUrl}/v1` })
    if (nextUrl) sendToRenderer('connections:openai', {
      action: 'add', url: `${nextUrl}/v1`, config: { provider: 'llama.cpp', connection_type: 'local' }
    })
    registeredLlamaUrl = nextUrl
    sendToRenderer('models:refresh')
  }
  if (info.reachable) sendToRenderer('llamacpp:ready', info)
})

const startServerHandler = async (): Promise<boolean> => {
  if (isQuiting) return false
  try {
    await startServer((status) => sendToRenderer('status:install', status))
    return true
  } catch (error) {
    if (webuiService.info.status === 'failed') {
      log.error('Failed to start server:', error)
      sendToRenderer('error', { message: `Failed to start server: ${error?.message}` })
    }
    return false
  }
}

const stopServerHandler = async (): Promise<boolean> => {
  try {
    await webuiService.stop()
    return true
  } catch (error) {
    log.error('Failed to stop server:', error)
    return false
  }
}

const resetAppHandler = async () => {
  try {
    await webuiService.stop()
    // Stop and uninstall llama.cpp if running
    try {
      await uninstallLlamaCpp()
      sendToRenderer('status:llamacpp', null)
    } catch (e) {
      log.warn('Failed to uninstall llama.cpp during reset:', e)
    }
    // Remove GPU crash marker so sandbox is re-tested on next launch
    try {
      if (existsSync(gpuCrashMarkerPath)) {
        unlinkSync(gpuCrashMarkerPath)
        log.info('GPU crash marker removed during reset')
      }
    } catch (e) {
      log.warn('Failed to remove GPU crash marker during reset:', e)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await resetApp()
    CONFIG = await getConfig() // reload from defaults since config.json was deleted
    new Notification({ title: 'Open WebUI', body: 'Application has been reset.' }).show()
  } catch (error) {
    log.error('Failed to reset:', error)
    new Notification({ title: 'Open WebUI', body: `Reset failed: ${error.message}` }).show()
  }
}

// ─── Helpers ────────────────────────────────────────────

const sendToRenderer = (type: string, data?: any) => {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('main:data', { type, data })
  }
}

// ─── App Lifecycle ──────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.setAboutPanelOptions({
    applicationName: 'Open WebUI',
    iconPath: icon,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    website: 'https://openwebui.com',
    copyright: `© ${new Date().getFullYear()} Open WebUI`
  })

  app.whenReady().then(async () => {
    CONFIG = await getConfig()
    log.info('Config:', CONFIG)

    app.name = 'Open WebUI'
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
    }
    electronApp.setAppUserModelId('com.openwebui.desktop')

    // ─── GPU Process Crash Recovery ──────────────────
    // If the GPU process exits fatally (e.g. sandbox init failure on
    // certain NVIDIA/Intel drivers), write a marker and relaunch with
    // --disable-gpu-sandbox so the user doesn't have to manually edit
    // shortcut targets (see issue #110).
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU') {
        log.error(
          `GPU process gone: reason=${details.reason}, exitCode=${details.exitCode}`
        )

        // Only auto-recover from fatal crashes, not normal/clean exits
        if (
          details.reason === 'crashed' ||
          details.reason === 'launch-failed' ||
          details.reason === 'abnormal-exit'
        ) {
          if (!gpuSandboxDisabled) {
            log.info('Writing GPU crash marker and relaunching with --disable-gpu-sandbox')
            try {
              writeFileSync(gpuCrashMarkerPath, new Date().toISOString(), 'utf-8')
            } catch (e) {
              log.warn('Failed to write GPU crash marker:', e)
            }
            app.relaunch({ args: [...process.argv.slice(1), '--disable-gpu-sandbox'] })
            app.exit(0)
          }
        }
      }
    })

    // If we previously set the GPU sandbox marker and this session
    // started successfully, log it so it's visible in diagnostics.
    if (gpuSandboxDisabled) {
      log.info('Running with GPU sandbox disabled (marker file present)')
    }

    app.on('session-created', (newSession) => {
      // Grant media / notification permissions for webview partition sessions
      // so that auth flows, media capture, and notifications work correctly.
      newSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = ['media', 'display-capture', 'mediaKeySystem', 'notifications', 'clipboard-read', 'clipboard-sanitized-write']
        callback(allowed.includes(permission))
      })

      newSession.setDisplayMediaRequestHandler(
        (request, callback) => {
          desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            callback({ video: sources[0], audio: 'loopback' })
          })
        },
        { useSystemPicker: true }
      )
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)

      // Auto-reload when the renderer process dies so the user doesn't
      // see a permanent blank/grey screen.
      window.webContents.on('render-process-gone', (_event, details) => {
        log.error(
          `Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`
        )
        if (details.reason !== 'clean-exit') {
          window.webContents.reload()
        }
      })
    })

    // Log webview guest renderer crashes for diagnostics — the existing
    // 'crashed' listener in Content.svelte surfaces these to the user.
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event, preferences, params) => {
        if (!/^https?:\/\//i.test(params.src)) {
          event.preventDefault()
          return
        }
        preferences.preload = join(__dirname, '../preload/content-preload.js')
        preferences.nodeIntegration = false
        preferences.nodeIntegrationInWorker = false
        preferences.nodeIntegrationInSubFrames = false
        preferences.contextIsolation = true
        preferences.sandbox = true
        preferences.webSecurity = true
        preferences.allowRunningInsecureContent = false
      })
      contents.on('render-process-gone', (_e, details) => {
        if (details.reason !== 'clean-exit') {
          log.error(
            `WebContents render-process-gone: type=${contents.getType()}, ` +
            `reason=${details.reason}, exitCode=${details.exitCode}`
          )
        }
      })

      if (contents.getType() === 'webview') {
        // Keep OAuth navigation and popups in their session; ordinary tabs open externally.
        contents.setWindowOpenHandler(({ url, disposition, features }) => {
          const isWebUrl = /^https?:\/\//i.test(url)
          // Shift-clicking a link also requests a new window, but has no popup features.
          if (disposition === 'new-window' && features && (isWebUrl || url === 'about:blank')) {
            return {
              action: 'allow',
              overrideBrowserWindowOptions: {
                webPreferences: {
                  session: contents.session,
                  nodeIntegration: false,
                  contextIsolation: true,
                  sandbox: true,
                  webviewTag: false
                }
              }
            }
          }
          if (isWebUrl) openUrl(url)
          return { action: 'deny' }
        })

        // ── Native right-click context menu (#161) ──────────────────
        // Electron <webview> guests don't show a context menu by default,
        // which blocks right-click → Paste / Autofill / password-manager
        // integration on login pages.  Build a native menu with standard
        // editing actions, spell-check suggestions, and link/image handling.
        contents.on('context-menu', (_event, params) => {
          const menuItems: Electron.MenuItemConstructorOptions[] = []

          // Spell-check suggestions (if any)
          if (params.misspelledWord && params.dictionarySuggestions?.length) {
            for (const suggestion of params.dictionarySuggestions) {
              menuItems.push({
                label: suggestion,
                click: () => contents.replaceMisspelling(suggestion)
              })
            }
            menuItems.push({ type: 'separator' })
          }

          // Link handling
          if (params.linkURL) {
            menuItems.push({
              label: 'Open Link in Browser',
              click: () => openUrl(params.linkURL)
            })
            menuItems.push({
              label: 'Copy Link',
              click: () => clipboard.writeText(params.linkURL)
            })
            menuItems.push({ type: 'separator' })
          }

          // Editable field actions (input, textarea, contenteditable)
          if (params.isEditable) {
            menuItems.push(
              { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
              { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
              { type: 'separator' },
              { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
              { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
              { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
              { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll }
            )
          } else if (params.selectionText) {
            // Non-editable text selection
            menuItems.push(
              { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }
            )
          }

          if (params.mediaType === 'image') {
            if (menuItems.length > 0 && menuItems[menuItems.length - 1].type !== 'separator') {
              menuItems.push({ type: 'separator' })
            }
            menuItems.push(
              {
                label: 'Copy Image',
                enabled: params.hasImageContents,
                click: () => contents.copyImageAt(params.x, params.y)
              },
              {
                label: 'Save Image As…',
                enabled: !!params.srcURL,
                click: () => contents.downloadURL(params.srcURL)
              }
            )
          }

          if (menuItems.length > 0) {
            Menu.buildFromTemplate(menuItems).popup()
          }
        })
      }
    })

    // ─── IPC Handlers ─────────────────────────────────

    ipcMain.handle('get:version', () => app.getVersion())

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      username: require('os').userInfo().username,
      gpuSandboxDisabled
    }))

    ipcMain.handle('app:contentPreloadPath', () => {
      return `file://${join(__dirname, '../preload/content-preload.js')}`
    })

    ipcMain.handle('app:defaultDataPath', () => {
      return join(getUserDataPath(), 'data')
    })

    ipcMain.handle('app:installDir', () => {
      return getInstallDir()
    })

    ipcMain.handle('system:diskSpace', async () => {
      try {
        const stats = await statfs(getUserDataPath())
        return { free: stats.bavail * stats.bsize }
      } catch (error) {
        log.error('Failed to check disk space:', error)
        return { free: -1 }
      }
    })

    ipcMain.handle('get:config', () => getConfig())
    ipcMain.on('window:theme', (event, dark) => {
      if (process.platform === 'darwin' || !mainWindow || mainWindow.isDestroyed()) return
      if (event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) return
      if (typeof dark !== 'boolean') return
      mainWindow.setTitleBarOverlay({ symbolColor: dark ? '#ffffff' : '#000000' })
    })
    ipcMain.handle('set:config', async (_event, config) => {
      await setConfig(config)
      CONFIG = await getConfig()
      updateTray()
      registerShortcuts(CONFIG.globalShortcut)
    })

    // Python/uv
    ipcMain.handle('install:python', async () => {
      try {
        sendToRenderer('status:install', 'Downloading Python…')
        const res = await installPython(undefined, (status: string) => {
          sendToRenderer('status:install', status)
        })
        sendToRenderer('status:python', res)
        return res
      } catch (error) {
        sendToRenderer('status:python', false)
        sendToRenderer('error', { message: error?.message ?? 'Python installation failed. Please check your internet connection and try again.' })
        return false
      }
    })

    ipcMain.handle('status:python', async () => {
      return (await isPythonInstalled()) && (await isUvInstalled())
    })

    // Package
    ipcMain.handle('install:package', async () => {
      try {
        CONFIG = await getConfig()
        const owuiVersion = CONFIG?.localServer?.version || undefined

        sendToRenderer('status:install', 'Installing Open WebUI…')
        await installPackage('open-webui', owuiVersion, (status: string) => {
          sendToRenderer('status:install', status)
        })
        sendToRenderer('status:package', true)
        // Notify renderer of install state change
        sendToRenderer('packages:changed', {
          'open-webui': isPackageInstalled('open-webui')
        })
        updateTray()
        return true
      } catch (error) {
        sendToRenderer('status:package', false)
        sendToRenderer('error', { message: error?.message ?? 'Package installation failed. Please check your internet connection and try again.' })
        return false
      }
    })

    ipcMain.handle('status:package', async () => isPackageInstalled('open-webui'))

    // Server
    ipcMain.handle('server:start', () => startServerHandler())
    ipcMain.handle('server:stop', () => stopServerHandler())
    ipcMain.handle('server:restart', async () => {
      if (!(await stopServerHandler())) return false
      return startServerHandler()
    })
    ipcMain.handle('server:logs', () => [webuiService.logs])
    ipcMain.handle('server:logs:clear', () => webuiService.clearLogs())
    ipcMain.handle('server:info', () => webuiService.info)

    ipcMain.on('terminal:connect', (event, serviceId: string, connectionId: number) => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return
      const service = serviceId === 'server' ? webuiService : serviceId === 'llamacpp' ? llamaService : null
      if (!service || !Number.isSafeInteger(connectionId)) return
      attachTerminal(service, event.sender, connectionId)
    })

    ipcMain.handle('server:open', () => openLocalWebUI())

    // Updater
    ipcMain.handle('updater:check', () => checkForUpdates())
    ipcMain.handle('updater:download', () => downloadUpdate())
    ipcMain.handle('updater:install', () => installUpdate())

    // Changelog
    ipcMain.handle('app:changelog', async () => {
      try {
        const changelogPath = app.isPackaged
          ? join(process.resourcesPath, 'CHANGELOG.md')
          : join(app.getAppPath(), 'CHANGELOG.md')
        return await readFile(changelogPath, 'utf-8')
      } catch {
        return null
      }
    })

    // Misc
    ipcMain.handle('app:reset', () => resetAppHandler())

    // llama.cpp
    ipcMain.handle('llamacpp:setup', async () => {
      try {
        const binary = await setupLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('llamacpp:info', getLlamaCppInfo())
        return binary
      } catch (error) {
        log.error('Failed to setup llamacpp:', error)
        sendToRenderer('error', { message: `llamacpp setup failed: ${error?.message}` })
        return null
      }
    })

    ipcMain.handle('llamacpp:start', async () => {
      if (isQuiting) return null
      try {
        return await startLlamaCpp((status) => sendToRenderer('status:llamacpp-setup', status))
      } catch (error) {
        if (llamaService.info.status === 'failed') {
          log.error('Failed to start llamacpp:', error)
          sendToRenderer('error', { message: `llamacpp failed: ${error?.message}` })
        }
        return null
      } finally { sendToRenderer('status:llamacpp-setup', '') }
    })
    ipcMain.handle('llamacpp:stop', async () => {
      await stopLlamaCpp()
      return true
    })
    ipcMain.handle('llamacpp:info', () => getLlamaCppInfo())
    ipcMain.handle('llamacpp:asset-name', (_event, variant?: string) => getLlamaCppAssetName(variant))
    ipcMain.handle('llamacpp:logs', () => [llamaService.logs])

    ipcMain.handle('llamacpp:uninstall', async () => {
      try {
        await uninstallLlamaCpp()
        sendToRenderer('llamacpp:info', getLlamaCppInfo())
        await setConfig({ llamaCpp: { ...CONFIG?.llamaCpp, enabled: false } })
        CONFIG = await getConfig()
        return true
      } catch (error) {
        log.error('Failed to uninstall llamacpp:', error)
        return false
      }
    })

    // Hugging Face models
    ipcMain.handle('huggingface:models:list', () => listModels())
    ipcMain.handle('huggingface:models:dir', () => getModelsDir())
    ipcMain.handle('huggingface:models:delete', (_event, repo: string, filename: string) => {
      return deleteModel(repo, filename)
    })
    ipcMain.handle('huggingface:models:cancel', (_event, repo?: string, filename?: string) => {
      cancelDownload(repo, filename)
      return true
    })
    ipcMain.handle('huggingface:search', async (_event, query: string, token?: string) => {
      return searchModels(query, token)
    })
    ipcMain.handle('huggingface:repo:files', async (_event, repo: string, token?: string) => {
      return getRepoFiles(repo, token)
    })
    ipcMain.handle('huggingface:models:download', async (_event, repo: string, filename: string, token?: string, expectedSize?: number) => {
      try {
        sendToRenderer('status:huggingface-download', { repo, filename, status: 'downloading', percent: 0 })
        const filepath = await downloadModel(repo, filename, (progress) => {
          sendToRenderer('status:huggingface-download', {
            repo, filename,
            status: 'downloading',
            percent: progress.percent,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes
          })
        }, token, expectedSize)
        sendToRenderer('status:huggingface-download', { repo, filename, status: 'done', filepath })
        return filepath
      } catch (error) {
        log.error('Failed to download model:', error)
        sendToRenderer('status:huggingface-download', { repo, filename, status: 'failed', error: error?.message })
        sendToRenderer('error', { message: `Model download failed: ${error?.message}` })
        return null
      }
    })

    ipcMain.handle('package:version', (_event, packageName: string) => getPackageVersion(packageName))
    ipcMain.handle('package:uninstall', async (_event, packageName: string) => {
      const result = uninstallPackage(packageName)
      // Notify renderer of install state change
      sendToRenderer('packages:changed', {
        'open-webui': isPackageInstalled('open-webui')
      })
      updateTray()
      return result
    })

    ipcMain.handle('dialog:selectFolder', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    })

    ipcMain.handle('app:launchAtLogin:get', () => {
      return app.getLoginItemSettings().openAtLogin
    })
    ipcMain.handle('app:launchAtLogin:set', (_event, enabled: boolean) => {
      app.setLoginItemSettings({ openAtLogin: enabled })
    })

    ipcMain.handle('open:browser', async (_event, { url }) => {
      if (!url) throw new Error('No URL provided')
      let normalizedUrl = url
      if (normalizedUrl.startsWith('http://0.0.0.0')) {
        normalizedUrl = normalizedUrl.replace('http://0.0.0.0', 'http://localhost')
      }
      await openUrl(normalizedUrl)
    })

    ipcMain.handle('open:path', async (_event, folderPath: string) => {
      if (!folderPath) throw new Error('No path provided')
      await shell.openPath(folderPath)
    })

    ipcMain.handle('notification', async (_event, { title, body }) => {
      new Notification({ title, body }).show()
    })

    ipcMain.handle('llamacpp:check-update', async () => {
      try {
        return await checkLlamaCppUpdate()
      } catch (error) {
        log.error('Failed to check llamacpp update:', error)
        throw error
      }
    })

    ipcMain.handle('llamacpp:update', async () => {
      try {
        const result = await updateLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('llamacpp:info', getLlamaCppInfo())
        return result
      } catch (error) {
        log.error('Failed to update llamacpp:', error)
        sendToRenderer('error', { message: `llamacpp update failed: ${error?.message}` })
        throw error
      }
    })

    // ─── Startup ──────────────────────────────────────

    // Create tray
    const trayIcon = nativeImage.createFromPath(icon)
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
    tray.setToolTip('Open WebUI Desktop')
    updateTray()



    // Global shortcut
    registerShortcuts(CONFIG.globalShortcut)

    createMainWindow()
    // Show startup logs immediately while the service prepares and becomes ready.
    if (CONFIG?.llamaCpp?.enabled) {
      startLlamaCpp((status) => sendToRenderer('status:llamacpp-setup', status))
        .catch((error) => log.error('Auto-start llama.cpp failed:', error))
        .finally(() => sendToRenderer('status:llamacpp-setup', ''))
    }

    // Initialize auto-updater
    if (mainWindow) {
      initUpdater(mainWindow)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  let cleanupComplete = false
  let cleanupStarted = false
  app.on('before-quit', (event) => {
    if (cleanupComplete) return
    event.preventDefault()
    if (cleanupStarted) return
    cleanupStarted = true
    isQuiting = true
    Promise.allSettled([llamaService.shutdown(), webuiService.shutdown()]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') log.error('Service shutdown failed:', result.reason)
      }
      cleanupComplete = true
      app.quit()
    })
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    mainWindow = null
    tray?.destroy()
    tray = null
  })
}
