// @ts-nocheck

import {
  app,
  shell,
  session,
  clipboard,
  nativeImage,
  desktopCapturer,
  systemPreferences,
  BrowserWindow,
  globalShortcut,
  MessageChannelMain,
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
  checkUrlAndOpen,
  clearAllServerLogs,
  getConfig,
  getUserDataPath,
  getInstallDir,
  getServerLog,
  getServerPIDs,
  getServerPty,
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
  stopAllServers,
  uninstallPython,
  validateRemoteUrl,
  type AppConfig,
  type Connection
} from './utils'

import {
  startOpenTerminal,
  stopOpenTerminal,
  getOpenTerminalInfo,
  getOpenTerminalPty,
  getOpenTerminalLog,
  validateOpenTerminalProcess
} from './utils/open-terminal'

import {
  setupLlamaCpp,
  startLlamaCpp,
  stopLlamaCpp,
  getLlamaCppInfo,
  getLlamaCppLog,
  getLlamaCppPty,
  validateLlamaCppProcess,
  checkLlamaCppUpdate,
  updateLlamaCpp,
  uninstallLlamaCpp
} from './utils/llamacpp'

import {
  listModels,
  downloadModel,
  deleteModel,
  cancelDownload,
  cancelDownloadForFile,
  getModelsDir,
  searchModels,
  getRepoFiles
} from './utils/huggingface'

import { initUpdater, checkForUpdates, downloadUpdate, installUpdate } from './updater'

import log from 'electron-log'
log.transports.file.resolvePathFn = () => getLogFilePath('main')

import icon from '../../resources/icon.png?asset'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

// ─── State ──────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let contentWindow: BrowserWindow | null = null
let spotlightWindow: BrowserWindow | null = null
let voiceInputWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuiting = false

let CONFIG: AppConfig | null = null
let SERVER_URL: string | null = null
let SERVER_STATUS: string | null = null
let SERVER_REACHABLE = false
let SERVER_PID: number | null = null
let AUTH_TOKEN: string | null = null
let voiceInputRecording = false

// ─── Global Shortcuts ───────────────────────────────────

const registerShortcuts = (globalAccel?: string, spotlightAccel?: string, voiceInputAccel?: string, callAccel?: string): void => {
  globalShortcut.unregisterAll()

  // Global shortcut – bring main window to foreground
  if (globalAccel) {
    try {
      globalShortcut.register(globalAccel, () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createMainWindow()
        }
      })
    } catch (error) {
      log.warn('Failed to register global shortcut:', globalAccel, error)
    }
  }

  // Spotlight shortcut – toggle the spotlight input bar
  if (spotlightAccel) {
    try {
      globalShortcut.register(spotlightAccel, () => {
        const text = clipboard.readText()?.trim() || ''
        toggleSpotlight(text)
      })
    } catch (error) {
      log.warn('Failed to register spotlight shortcut:', spotlightAccel, error)
    }
  }

  // Voice input shortcut – toggle microphone recording
  if (voiceInputAccel && CONFIG?.voiceInputEnabled !== false) {
    try {
      const ok = globalShortcut.register(voiceInputAccel, () => {
        toggleVoiceInput()
      })
      log.info(`Voice input shortcut "${voiceInputAccel}" registered: ${ok}`)
      if (!ok) {
        new Notification({
          title: 'Voice Input',
          body: `Could not register shortcut "${voiceInputAccel}". It may be in use by another application.`
        }).show()
      }
    } catch (error) {
      log.warn('Failed to register voice input shortcut:', voiceInputAccel, error)
      new Notification({
        title: 'Voice Input',
        body: `Failed to register shortcut "${voiceInputAccel}". It may conflict with another application.`
      }).show()
    }
  } else {
    log.info(`Voice input shortcut skipped — accel="${voiceInputAccel}", enabled=${CONFIG?.voiceInputEnabled}`)
  }

  // Call shortcut – open the voice/video call overlay
  if (callAccel && CONFIG?.callEnabled !== false) {
    try {
      const ok = globalShortcut.register(callAccel, () => {
        toggleCall()
      })
      log.info(`Call shortcut "${callAccel}" registered: ${ok}`)
      if (!ok) {
        new Notification({
          title: 'Call',
          body: `Could not register shortcut "${callAccel}". It may be in use by another application.`
        }).show()
      }
    } catch (error) {
      log.warn('Failed to register call shortcut:', callAccel, error)
      new Notification({
        title: 'Call',
        body: `Failed to register shortcut "${callAccel}". It may conflict with another application.`
      }).show()
    }
  } else {
    log.info(`Call shortcut skipped — accel="${callAccel}", enabled=${CONFIG?.callEnabled}`)
  }
}

// ─── Spotlight Window ───────────────────────────────────
// Bar position within the fullscreen window (persisted to config).
let spotlightBarOffset: { x: number; y: number } | null = null

function loadSpotlightPosition(): void {
  if (CONFIG?.spotlightPosition) {
    spotlightBarOffset = { ...CONFIG.spotlightPosition }
  }
}

function createSpotlightWindow(): BrowserWindow {
  const { screen } = require('electron')
  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: sx, y: sy, width: sw, height: sh } = activeDisplay.bounds

  spotlightWindow = new BrowserWindow({
    x: sx,
    y: sy,
    width: sw,
    height: sh,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    focusable: true,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/spotlight-preload.js'),
      sandbox: false,
      webviewTag: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    spotlightWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/spotlight.html`)
  } else {
    spotlightWindow.loadFile(join(__dirname, '../renderer/spotlight.html'))
  }

  // Hide on blur — but only when the window was truly visible and settled.
  let blurArmed = false
  spotlightWindow.on('focus', () => {
    blurArmed = false
    setTimeout(() => {
      blurArmed = true
    }, 200)
  })
  spotlightWindow.on('blur', () => {
    if (blurArmed) {
      spotlightWindow?.hide()
      // Restore main window when spotlight dismisses
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
      }
    }
  })

  spotlightWindow.on('closed', () => {
    // Restore main window if spotlight is closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
    spotlightWindow = null
  })

  return spotlightWindow
}

function showAndFocusSpotlight(win: BrowserWindow, initialQuery?: string): void {
  if (process.platform === 'darwin') {
    app.focus({ steal: true })
  }

  // Reposition fullscreen window to the active display
  const { screen } = require('electron')
  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: sx, y: sy, width: sw, height: sh } = activeDisplay.bounds
  win.setBounds({ x: sx, y: sy, width: sw, height: sh })

  // Hide main window so it doesn't appear behind the transparent overlay
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide()
  }

  win.show()
  win.focus()
  win.webContents.focus()

  // Send initial data to the renderer (bar offset + optional query)
  win.webContents.send('spotlight:init', {
    barOffset: spotlightBarOffset,
    screenSize: { width: sw, height: sh },
    query: initialQuery || ''
  })
}

function toggleSpotlight(selectedText?: string): void {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    if (spotlightWindow.isVisible()) {
      spotlightWindow.hide()
    } else {
      showAndFocusSpotlight(spotlightWindow, selectedText)
    }
  } else {
    const win = createSpotlightWindow()
    win.once('ready-to-show', () => {
      showAndFocusSpotlight(win, selectedText)
    })
  }
}

// ─── Voice Input Window ─────────────────────────────────

function createVoiceInputWindow(): BrowserWindow {
  const { screen } = require('electron')
  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: sx, y: sy, width: sw } = activeDisplay.bounds

  const winW = 340
  const winH = 72

  voiceInputWindow = new BrowserWindow({
    x: sx + Math.round((sw - winW) / 2),
    y: sy + 120,
    width: winW,
    height: winH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    focusable: true,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/voice-input-preload.js'),
      sandbox: false,
      webviewTag: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // Grant microphone permission for the voice input window
  voiceInputWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === 'media')
    }
  )

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    voiceInputWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/voice-input.html`)
  } else {
    voiceInputWindow.loadFile(join(__dirname, '../renderer/voice-input.html'))
  }

  voiceInputWindow.on('closed', () => {
    voiceInputWindow = null
    voiceInputRecording = false
  })

  return voiceInputWindow
}

function playChime(ascending: boolean): Promise<void> {
  return new Promise((resolve) => {
    const { execFile } = require('child_process')
    const fs = require('fs')
    const file = ascending ? 'chime-start.wav' : 'chime-stop.wav'
    const soundPath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'sounds', file)
      : join(app.getAppPath(), 'resources', 'sounds', file)

    const exists = fs.existsSync(soundPath)
    log.info(`playChime: ${ascending ? 'start' : 'stop'}, path=${soundPath}, exists=${exists}`)

    if (!exists) { resolve(); return }

    if (process.platform === 'darwin') {
      execFile('afplay', [soundPath], (err, stdout, stderr) => {
        if (err) log.warn('afplay error:', err.message, stderr)
        resolve()
      })
    } else if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command',
        `(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`
      ], () => resolve())
    } else {
      execFile('paplay', [soundPath], (err) => {
        if (err) execFile('aplay', [soundPath], () => resolve())
        else resolve()
      })
    }
  })
}

async function toggleVoiceInput(): Promise<void> {
  if (voiceInputRecording) {
    // Stop recording — chime plays in done/close handler after mic is released
    voiceInputRecording = false
    if (voiceInputWindow && !voiceInputWindow.isDestroyed()) {
      voiceInputWindow.webContents.send('voiceInput:state', { recording: false })
    }
    return
  }

  // Pre-flight: check microphone permission on macOS
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (!granted) {
        log.warn('Voice input: microphone permission denied')
        new Notification({
          title: 'Voice Input',
          body: 'Microphone access denied. Enable it in System Settings → Privacy & Security → Microphone, then restart the app.'
        }).show()
        return
      }
    }
  }

  // Pre-flight: check a connection is configured
  try {
    const config = await getConfig()
    if (!config.defaultConnectionId || config.connections.length === 0) {
      log.warn('Voice input: no connection configured')
      new Notification({
        title: 'Voice Input',
        body: 'No connection configured. Set up a connection in Settings before using voice input.'
      }).show()
      return
    }
    const conn = config.connections.find((c) => c.id === config.defaultConnectionId)
    if (!conn) {
      log.warn('Voice input: default connection not found')
      new Notification({
        title: 'Voice Input',
        body: 'Default connection not found. Check your connection settings.'
      }).show()
      return
    }
  } catch (err: any) {
    log.warn('Voice input: config check failed:', err)
  }

  // Start recording — chime plays concurrently (separate audio output path from mic input)
  voiceInputRecording = true
  playChime(true)

  if (voiceInputWindow && !voiceInputWindow.isDestroyed()) {
    voiceInputWindow.show()
    voiceInputWindow.focus()
    voiceInputWindow.webContents.send('voiceInput:state', { recording: true })
  } else {
    const win = createVoiceInputWindow()
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
      setTimeout(() => {
        win.webContents.send('voiceInput:state', { recording: true })
      }, 100)
    })
  }
}

// ─── Call Shortcut ──────────────────────────────────────

async function toggleCall(): Promise<void> {
  // Pre-flight: check a connection is configured
  try {
    const config = await getConfig()
    if (!config.defaultConnectionId || config.connections.length === 0) {
      log.warn('Call: no connection configured')
      new Notification({
        title: 'Call',
        body: 'No connection configured. Set up a connection in Settings before using the call shortcut.'
      }).show()
      return
    }
    const conn = config.connections.find((c) => c.id === config.defaultConnectionId)
    if (!conn) {
      log.warn('Call: default connection not found')
      new Notification({
        title: 'Call',
        body: 'Default connection not found. Check your connection settings.'
      }).show()
      return
    }

    let url = conn.url
    if (conn.type === 'local' && SERVER_URL) {
      url = SERVER_URL
    }
    if (url.startsWith('http://0.0.0.0')) {
      url = url.replace('http://0.0.0.0', 'http://localhost')
    }

    sendToRenderer('call', { connectionId: conn.id, url })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  } catch (err: any) {
    log.warn('Call: config check failed:', err)
  }
}

// ─── Windows ────────────────────────────────────────────

function createMainWindow(show = true): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    titleBarStyle: process.platform === 'win32' ? 'default' : 'hidden',
    trafficLightPosition: { x: 10, y: 10 },
    autoHideMenuBar: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    ...(process.platform === 'win32' ? { frame: true } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })
  mainWindow.setIcon(icon)

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

function createContentWindow(url: string, connectionId: string): BrowserWindow {
  if (contentWindow && !contentWindow.isDestroyed()) {
    contentWindow.loadURL(url)
    contentWindow.show()
    return contentWindow
  }

  contentWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
    titleBarStyle: process.platform === 'win32' ? 'default' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true,
    ...(process.platform === 'win32' ? { frame: true } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      partition: `persist:connection-${connectionId}`
    }
  })

  // Enable media capture
  session
    .fromPartition(`persist:connection-${connectionId}`)
    .setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowedPermissions = ['media', 'mediaKeySystem', 'notifications']
      callback(allowedPermissions.includes(permission))
    })

  contentWindow.on('ready-to-show', () => {
    contentWindow?.show()
  })

  contentWindow.webContents.setWindowOpenHandler((details) => {
    openUrl(details.url)
    return { action: 'deny' }
  })

  contentWindow.loadURL(url)

  contentWindow.on('close', (event) => {
    if (!isQuiting) {
      if (CONFIG?.runInBackground === false) {
        isQuiting = true
        app.quit()
      } else {
        event.preventDefault()
        contentWindow?.hide()
      }
    }
  })

  contentWindow.on('closed', () => {
    contentWindow = null
  })

  return contentWindow
}

// ─── Tray ───────────────────────────────────────────────

const updateTray = () => {
  if (!tray || !CONFIG) return

  const connectionItems = (CONFIG.connections || []).map((conn) => ({
    label: `${conn.id === CONFIG.defaultConnectionId ? '★ ' : ''}${conn.name}`,
    sublabel: conn.url,
    click: async () => {
      const result = await connectTo(conn)
      if (result) sendToRenderer('connection:open', result)
    }
  }))

  const trayMenuTemplate = [
    {
      label: 'Show Open WebUI',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    ...(connectionItems.length > 0
      ? [
          { label: 'Connections', enabled: false },
          ...connectionItems,
          { type: 'separator' }
        ]
      : []),
    ...(SERVER_STATUS === 'started' && SERVER_URL
      ? [
          {
            label: `Local: ${SERVER_URL}`,
            click: () => {
              if (SERVER_URL) clipboard.writeText(SERVER_URL)
            }
          },
          { type: 'separator' }
        ]
      : []),
    {
      label: 'Quit Open WebUI',
      accelerator: 'CommandOrControl+Q',
      click: async () => {
        await stopServerHandler()
        isQuiting = true
        app.quit()
      }
    }
  ]

  const trayMenu = Menu.buildFromTemplate(trayMenuTemplate)
  tray?.setContextMenu(trayMenu)
}

// ─── Connection Management ──────────────────────────────

const connectTo = async (connection: Connection) => {
  let url = connection.url

  if (connection.type === 'local') {
    // Start local server if needed
    if (SERVER_STATUS !== 'started') {
      const started = await startServerHandler()
      if (!started) return null
    }
    url = SERVER_URL || connection.url

    // Wait for the server to actually be reachable before opening the view.
    // startServerHandler returns as soon as the process spawns, but the HTTP
    // endpoint might not be ready yet (especially on first launch).
    if (!SERVER_REACHABLE) {
      const maxWait = 120_000
      const poll = 2_000
      const t0 = Date.now()
      while (!SERVER_REACHABLE && Date.now() - t0 < maxWait) {
        await new Promise((r) => setTimeout(r, poll))
      }
      if (!SERVER_REACHABLE) {
        log.warn('connectTo: server did not become reachable within timeout')
        return null
      }
    }
  }

  // Normalize URL
  if (url.startsWith('http://0.0.0.0')) {
    url = url.replace('http://0.0.0.0', 'http://localhost')
  }

  return { url, connectionId: connection.id }
}

// ─── Server Lifecycle ───────────────────────────────────

// Active PTY data listener — when a MessagePort is connected, PTY data
// flows to the port. This disposable gets replaced on each pty:connect.
let activePtyDataDisposable: { dispose: () => void } | null = null

const startServerHandler = async (): Promise<boolean> => {
  if (SERVER_STATUS === 'starting' || SERVER_STATUS === 'started') {
    log.info('[server] Already running or starting, skipping duplicate start')
    return true
  }
  await stopServerHandler()
  SERVER_STATUS = 'starting'
  sendToRenderer('status:server', SERVER_STATUS)

  try {
    CONFIG = await getConfig()
    const { url, pid } = await startServer(
      CONFIG?.localServer?.serveOnLocalNetwork ?? false,
      CONFIG?.localServer?.port ?? null
    )
    SERVER_URL = url
    SERVER_PID = pid
    SERVER_STATUS = 'started'
    log.info('Server started:', SERVER_URL, SERVER_PID)
    sendToRenderer('status:server', SERVER_STATUS)

    // Auto-push PTY port so an already-open log panel picks up live output
    connectPtyPort(pid)
    updateTray()

    checkUrlAndOpen(SERVER_URL, async () => {
      SERVER_REACHABLE = true
      sendToRenderer('server:ready', { url: SERVER_URL })
      updateTray()
    })

    return true
  } catch (error) {
    log.error('Failed to start server:', error)
    SERVER_STATUS = 'failed'
    sendToRenderer('status:server', SERVER_STATUS)
    sendToRenderer('error', { message: `Failed to start server: ${error?.message}` })
    updateTray()
    return false
  }
}

// Active PTY data listeners — one per PID, replaced on each pty:connect for that PID
const activePtyDisposables: Map<number, { dispose: () => void }> = new Map()

/**
 * Creates a MessagePort-based channel between a PTY process and the renderer.
 * Supports multiple concurrent PTYs — each identified by PID.
 *
 * Flow:
 *   PTY stdout → port1.postMessage → [transfer] → port2 (renderer) → xterm.write
 *   xterm.onData → port2.postMessage → [transfer] → port1 (main) → PTY.write
 */
const connectPtyPort = (pid?: number): void => {
  const targetPid = pid ?? SERVER_PID
  if (!mainWindow) return

  const { port1, port2 } = new MessageChannelMain()

  if (!targetPid) {
    if (SERVER_STATUS === 'starting') {
      log.info('pty:connect — server is starting, no PID yet')
    } else {
      log.info('pty:connect — no active server')
      port1.postMessage({ type: 'output', data: '[No active server process]\r\n' })
    }
    mainWindow.webContents.postMessage('pty:port', { pid: 0 }, [port2])
    return
  }

  // Clean up previous connection for this PID
  activePtyDisposables.get(targetPid)?.dispose()
  activePtyDisposables.delete(targetPid)

  const ptyProcess = getServerPty(targetPid)
  log.info(`pty:connect — PID ${targetPid}, pty exists: ${!!ptyProcess}`)

  // Replay buffered output so renderer sees full history
  const buffer = getServerLog(targetPid)
  if (buffer?.length) {
    for (const chunk of buffer) {
      port1.postMessage({ type: 'output', data: chunk })
    }
  }

  // PTY → port1 → renderer
  if (ptyProcess) {
    const disposable = ptyProcess.onData((data: string) => {
      port1.postMessage({ type: 'output', data })
    })
    activePtyDisposables.set(targetPid, disposable)

    // Renderer → port1 → PTY (interactive input)
    port1.on('message', (event) => {
      const msg = event.data
      if (msg.type === 'input') {
        ptyProcess.write(msg.data)
      } else if (msg.type === 'resize') {
        ptyProcess.resize(msg.cols, msg.rows)
      }
    })
    port1.start()
  }

  // Transfer port2 to the renderer
  mainWindow.webContents.postMessage('pty:port', { pid: targetPid }, [port2])
}

/**
 * MessagePort channel for the Open Terminal PTY — read-only log viewer.
 */
let activeOpenTerminalDisposable: { dispose: () => void } | null = null

const connectOpenTerminalPtyPort = (): void => {
  if (!mainWindow) return

  const { port1, port2 } = new MessageChannelMain()

  const otPty = getOpenTerminalPty()
  if (!otPty) {
    port1.postMessage({ type: 'output', data: '[Open Terminal is not running]\r\n' })
    mainWindow.webContents.postMessage('open-terminal:pty:port', null, [port2])
    return
  }

  // Clean up previous
  activeOpenTerminalDisposable?.dispose()

  // Replay log buffer
  const buffer = getOpenTerminalLog()
  for (const chunk of buffer) {
    port1.postMessage({ type: 'output', data: chunk })
  }

  // Live data
  const disposable = otPty.onData((data: string) => {
    port1.postMessage({ type: 'output', data })
  })
  activeOpenTerminalDisposable = disposable

  port1.start()
  mainWindow.webContents.postMessage('open-terminal:pty:port', null, [port2])
}

/**
 * MessagePort channel for the llamacpp PTY — log viewer.
 */
let activeLlamaCppDisposable: { dispose: () => void } | null = null

const connectLlamaCppPtyPort = (): void => {
  if (!mainWindow) return

  const { port1, port2 } = new MessageChannelMain()

  const lsPty = getLlamaCppPty()
  if (!lsPty) {
    port1.postMessage({ type: 'output', data: '[llamacpp is not running]\r\n' })
    mainWindow.webContents.postMessage('llamacpp:pty:port', null, [port2])
    return
  }

  // Clean up previous
  activeLlamaCppDisposable?.dispose()

  // Replay log buffer
  const buffer = getLlamaCppLog()
  for (const chunk of buffer) {
    port1.postMessage({ type: 'output', data: chunk })
  }

  // Live data
  const disposable = lsPty.onData((data: string) => {
    port1.postMessage({ type: 'output', data })
  })
  activeLlamaCppDisposable = disposable

  port1.start()
  mainWindow.webContents.postMessage('llamacpp:pty:port', null, [port2])
}

const stopServerHandler = async (): Promise<boolean> => {
  try {
    await stopAllServers()
    if (SERVER_STATUS) {
      SERVER_STATUS = 'stopped'
      updateTray()
    }
    SERVER_REACHABLE = false
    SERVER_URL = null
    sendToRenderer('status:server', SERVER_STATUS)
    return true
  } catch (error) {
    log.error('Failed to stop server:', error)
    return false
  }
}

const resetAppHandler = async () => {
  try {
    await stopServerHandler()
    SERVER_STATUS = null
    // Stop Open Terminal if running
    try {
      await stopOpenTerminal()
      sendToRenderer('status:open-terminal', null)
    } catch (e) {
      log.warn('Failed to stop Open Terminal during reset:', e)
    }
    // Stop and uninstall llama.cpp if running
    try {
      await uninstallLlamaCpp()
      sendToRenderer('status:llamacpp', null)
    } catch (e) {
      log.warn('Failed to uninstall llama.cpp during reset:', e)
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
  mainWindow?.webContents.send('main:data', { type, data })
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
    loadSpotlightPosition()
    log.info('Config:', CONFIG)

    app.name = 'Open WebUI'
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
    }
    electronApp.setAppUserModelId('com.openwebui.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ─── IPC Handlers ─────────────────────────────────

    ipcMain.handle('get:version', () => app.getVersion())

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      username: require('os').userInfo().username
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
    ipcMain.handle('set:config', async (_event, config) => {
      await setConfig(config)
      CONFIG = await getConfig()
      updateTray()
      voiceInputRecording = false
      registerShortcuts(CONFIG.globalShortcut, CONFIG.spotlightShortcut, CONFIG.voiceInputShortcut, CONFIG.callShortcut)
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
        const otVersion = CONFIG?.openTerminal?.version || undefined

        sendToRenderer('status:install', 'Installing Open WebUI…')
        await installPackage('open-webui', owuiVersion, (status: string) => {
          sendToRenderer('status:install', status)
        })
        sendToRenderer('status:install', 'Installing Open Terminal…')
        await installPackage('open-terminal', otVersion, (status: string) => {
          sendToRenderer('status:install', status)
        }).catch((e) =>
          log.warn('open-terminal install failed (non-fatal):', e)
        )
        sendToRenderer('status:package', true)
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
      await stopServerHandler()
      return startServerHandler()
    })
    ipcMain.handle('server:logs', () => (SERVER_PID ? getServerLog(SERVER_PID) : []))
    ipcMain.handle('server:logs:clear', () => clearAllServerLogs())

    // PTY MessagePort channel
    ipcMain.handle('pty:list', () => getServerPIDs())
    ipcMain.handle('pty:connect', (_event, pid?: number) => connectPtyPort(pid))
    ipcMain.handle('server:info', () => ({
      url: SERVER_URL,
      status: SERVER_STATUS,
      pid: SERVER_PID,
      reachable: SERVER_REACHABLE
    }))

    // Connections
    ipcMain.handle('connections:list', async () => {
      const config = await getConfig()
      return config.connections
    })

    ipcMain.handle('connections:add', async (_event, connection: Connection) => {
      const config = await getConfig()
      config.connections.push(connection)
      if (!config.defaultConnectionId) {
        config.defaultConnectionId = connection.id
      }
      await setConfig(config)
      CONFIG = config
      updateTray()
      return config.connections
    })

    ipcMain.handle('connections:remove', async (_event, id: string) => {
      const config = await getConfig()
      config.connections = config.connections.filter((c) => c.id !== id)
      if (config.defaultConnectionId === id) {
        config.defaultConnectionId = config.connections[0]?.id || null
      }
      await setConfig(config)
      CONFIG = config
      updateTray()
      return config.connections
    })

    ipcMain.handle('connections:update', async (_event, id: string, updates: Partial<Connection>) => {
      const config = await getConfig()
      const idx = config.connections.findIndex((c) => c.id === id)
      if (idx !== -1) {
        config.connections[idx] = { ...config.connections[idx], ...updates }
        await setConfig(config)
        CONFIG = config
        updateTray()
      }
      return config.connections
    })

    ipcMain.handle('connections:setDefault', async (_event, id: string) => {
      const config = await getConfig()
      config.defaultConnectionId = id
      await setConfig(config)
      CONFIG = config
      updateTray()
    })

    ipcMain.handle('connections:connect', async (_event, id: string) => {
      const config = await getConfig()
      const conn = config.connections.find((c) => c.id === id)
      if (conn) {
        return await connectTo(conn)
      }
      return null
    })

    ipcMain.handle('validate:url', async (_event, url: string) => {
      return await validateRemoteUrl(url)
    })

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

    // Auth token relay from webview
    ipcMain.handle('app:setAuthToken', (_event, token: string) => {
      AUTH_TOKEN = token || null
      log.info('Auth token updated from webview')
    })

    // Misc
    ipcMain.handle('app:reset', () => resetAppHandler())

    // Spotlight
    ipcMain.handle('spotlight:submit', async (_event, query: string, images?: string[]) => {
      const config = await getConfig()
      if (!config.defaultConnectionId || config.connections.length === 0) {
        mainWindow?.show()
        mainWindow?.focus()
        return
      }
      const conn = config.connections.find((c) => c.id === config.defaultConnectionId)
      if (!conn) {
        mainWindow?.show()
        mainWindow?.focus()
        return
      }

      let url = conn.url
      if (conn.type === 'local' && SERVER_URL) {
        url = SERVER_URL
      }
      if (url.startsWith('http://0.0.0.0')) {
        url = url.replace('http://0.0.0.0', 'http://localhost')
      }

      // Build files payload from screenshot images
      const files = images?.map((dataUrl, i) => ({
        name: `screenshot-${Date.now()}-${i + 1}.png`,
        mimeType: 'image/png',
        dataUrl
      }))

      sendToRenderer('query', { query, connectionId: conn.id, url, files })

      // Hide spotlight first (blur handler will restore main window)
      spotlightWindow?.hide()
      // Ensure main window is focused to receive the query
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
    ipcMain.handle('spotlight:close', () => {
      spotlightWindow?.hide()
      // blur handler restores main window
    })

    // Persist bar offset within the fullscreen spotlight window
    ipcMain.handle('spotlight:savePosition', async (_event, offset: { x: number; y: number }) => {
      spotlightBarOffset = offset
      setConfig({ spotlightPosition: offset }).catch((err) =>
        log.warn('Failed to persist spotlight bar position:', err)
      )
    })

    // Capture a region of the screen (called from Spotlight renderer after drag)
    ipcMain.handle(
      'spotlight:captureRegion',
      async (_event, rect: { x: number; y: number; width: number; height: number }) => {
        try {
          // ── Permission check (macOS) ──
          if (process.platform === 'darwin') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            if (status !== 'granted') {
              log.warn(`spotlight:captureRegion — screen recording permission: ${status}`)
              new Notification({
                title: 'Screen Recording Permission Required',
                body: 'Open WebUI needs Screen Recording access to capture screenshots. Please enable it in System Settings → Privacy & Security → Screen Recording, then restart the app.'
              }).show()
              // Open the correct System Preferences pane
              shell.openExternal(
                'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
              ).catch(() => {})
              return 'no-permission'
            }
          }

          // Make spotlight invisible (but don't hide it — hiding triggers macOS
          // window activation which brings up the main window behind it)
          spotlightWindow?.setOpacity(0)
          // Small delay to let the window fully disappear before capture
          await new Promise((r) => setTimeout(r, 150))

          const { screen } = require('electron')
          const cursorPoint = screen.getCursorScreenPoint()
          const display = screen.getDisplayNearestPoint(cursorPoint)
          const scaleFactor = display.scaleFactor || 1

          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(display.bounds.width * scaleFactor),
              height: Math.round(display.bounds.height * scaleFactor)
            }
          })

          // Find the source matching this display
          const source =
            sources.find((s) => s.display_id === String(display.id)) || sources[0]
          if (!source) {
            spotlightWindow?.setOpacity(1)
            return null
          }

          const fullImage = source.thumbnail
          // Validate thumbnail is not empty (can happen without permission)
          if (fullImage.isEmpty()) {
            log.warn('spotlight:captureRegion — captured thumbnail is empty (likely no permission)')
            spotlightWindow?.setOpacity(1)
            return null
          }

          const cropped = fullImage.crop({
            x: Math.round(rect.x * scaleFactor),
            y: Math.round(rect.y * scaleFactor),
            width: Math.round(rect.width * scaleFactor),
            height: Math.round(rect.height * scaleFactor)
          })

          // Restore spotlight visibility
          if (spotlightWindow && !spotlightWindow.isDestroyed()) {
            spotlightWindow.setOpacity(1)
          }

          return cropped.toDataURL()
        } catch (err) {
          log.error('spotlight:captureRegion failed:', err)
          // Restore spotlight on error
          spotlightWindow?.setOpacity(1)
          return null
        }
      }
    )

    // ── Voice Input ─────────────────────────────────────

    // Check microphone permission (macOS)
    ipcMain.handle('voiceInput:micPermission', async () => {
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('microphone')
        if (status !== 'granted') {
          const granted = await systemPreferences.askForMediaAccess('microphone')
          return granted ? 'granted' : 'denied'
        }
        return 'granted'
      }
      return 'granted' // Windows/Linux don't need explicit permission
    })

    // Transcribe audio via the connected server's STT endpoint
    ipcMain.handle('voiceInput:transcribe', async (_event, audioBuffer: ArrayBuffer, rendererToken?: string) => {
      try {
        const config = await getConfig()
        if (!config.defaultConnectionId || config.connections.length === 0) {
          throw new Error('No connection configured. Set up a connection in Settings first.')
        }
        const conn = config.connections.find((c) => c.id === config.defaultConnectionId)
        if (!conn) throw new Error('Default connection not found. Check your connection settings.')

        let url = conn.url
        if (conn.type === 'local' && SERVER_URL) {
          url = SERVER_URL
        }
        if (url.startsWith('http://0.0.0.0')) {
          url = url.replace('http://0.0.0.0', 'http://localhost')
        }

        // Use stored auth token (relayed from webview), fall back to renderer-provided or contentWindow
        let token = AUTH_TOKEN || rendererToken || ''
        if (!token) {
          // Scan all webContents to find the Open WebUI webview and read its token
          try {
            const { webContents: wc } = require('electron')
            const allContents = wc.getAllWebContents()
            for (const contents of allContents) {
              try {
                if (contents.getType() === 'webview' && !contents.isDestroyed()) {
                  const t = await contents.executeJavaScript(
                    `localStorage.getItem('token') || ''`
                  )
                  if (t) { token = t; break }
                }
              } catch {
                // Skip inaccessible webContents
              }
            }
          } catch {
            log.warn('voiceInput:transcribe — could not extract token from webviews')
          }
        }

        if (!token) {
          throw new Error('Not authenticated. Open a connection and sign in before using voice input.')
        }

        // Build multipart form data manually using Node.js
        const boundary = '----VoiceInput' + Date.now()
        const buffer = Buffer.from(audioBuffer)
        const filename = `recording-${Date.now()}.wav`

        const header = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${filename}"`,
          `Content-Type: audio/wav`,
          '',
          ''
        ].join('\r\n')

        const footer = `\r\n--${boundary}--\r\n`
        const headerBuf = Buffer.from(header, 'utf-8')
        const footerBuf = Buffer.from(footer, 'utf-8')
        const body = Buffer.concat([headerBuf, buffer, footerBuf])

        const response = await fetch(`${url}/api/v1/audio/transcriptions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`Transcription failed (HTTP ${response.status}). ${text || 'Check that your server has Speech-to-Text configured.'}`)
        }

        const result = await response.json()
        return result
      } catch (error: any) {
        log.error('voiceInput:transcribe failed:', error)
        new Notification({
          title: 'Voice Input Failed',
          body: error?.message || 'Transcription failed. Check logs for details.'
        }).show()
        throw error
      }
    })

    // Voice input completed — deliver text to chat
    ipcMain.handle('voiceInput:done', async (_event, text: string) => {
      voiceInputRecording = false
      playChime(false)
      if (voiceInputWindow && !voiceInputWindow.isDestroyed()) {
        voiceInputWindow.hide()
      }

      if (!text?.trim()) return

      // Deliver text through the same path as Spotlight
      const config = await getConfig()
      if (!config.defaultConnectionId || config.connections.length === 0) {
        mainWindow?.show()
        mainWindow?.focus()
        return
      }
      const conn = config.connections.find((c) => c.id === config.defaultConnectionId)
      if (!conn) {
        mainWindow?.show()
        mainWindow?.focus()
        return
      }

      let url = conn.url
      if (conn.type === 'local' && SERVER_URL) {
        url = SERVER_URL
      }
      if (url.startsWith('http://0.0.0.0')) {
        url = url.replace('http://0.0.0.0', 'http://localhost')
      }

      sendToRenderer('query', { query: text.trim(), connectionId: conn.id, url })

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })

    // Voice input window requests close
    ipcMain.handle('voiceInput:close', () => {
      voiceInputRecording = false
      playChime(false)
      if (voiceInputWindow && !voiceInputWindow.isDestroyed()) {
        voiceInputWindow.hide()
      }
    })

    // Voice input error
    ipcMain.handle('voiceInput:error', (_event, message: string) => {
      log.warn('Voice input error:', message)
      voiceInputRecording = false
      new Notification({
        title: 'Voice Input Error',
        body: message || 'An unknown error occurred with voice input.'
      }).show()
    })

    // Open Terminal
    ipcMain.handle('open-terminal:start', async () => {
      try {
        sendToRenderer('status:open-terminal', 'starting')
        const result = await startOpenTerminal(CONFIG?.openTerminal?.port ?? null)
        sendToRenderer('status:open-terminal', 'started')
        sendToRenderer('open-terminal:ready', result)
        // Notify webview to register terminal server at system level
        sendToRenderer('connections:terminal', {
          action: 'add',
          url: result.url,
          key: result.apiKey
        })
        // Save enabled state
        await setConfig({ openTerminal: { ...CONFIG?.openTerminal, enabled: true } })
        CONFIG = await getConfig()
        return result
      } catch (error) {
        log.error('Failed to start Open Terminal:', error)
        sendToRenderer('status:open-terminal', 'failed')
        sendToRenderer('error', { message: `Open Terminal failed: ${error?.message}` })
        return null
      }
    })

    ipcMain.handle('open-terminal:stop', async () => {
      try {
        const info = getOpenTerminalInfo()
        await stopOpenTerminal()
        sendToRenderer('status:open-terminal', 'stopped')
        // Notify webview to unregister terminal server
        if (info.url) {
          sendToRenderer('connections:terminal', {
            action: 'remove',
            url: info.url
          })
        }
        await setConfig({ openTerminal: { ...CONFIG?.openTerminal, enabled: false } })
        CONFIG = await getConfig()
        return true
      } catch (error) {
        log.error('Failed to stop Open Terminal:', error)
        return false
      }
    })

    ipcMain.handle('open-terminal:info', () => getOpenTerminalInfo())
    ipcMain.handle('open-terminal:status', () => isPackageInstalled('open-terminal'))
    ipcMain.handle('open-terminal:pty:connect', () => connectOpenTerminalPtyPort())

    // llama.cpp
    ipcMain.handle('llamacpp:setup', async () => {
      try {
        sendToRenderer('status:llamacpp', 'setting-up')
        const binary = await setupLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('status:llamacpp', 'ready')
        return binary
      } catch (error) {
        log.error('Failed to setup llamacpp:', error)
        sendToRenderer('status:llamacpp', 'failed')
        sendToRenderer('error', { message: `llamacpp setup failed: ${error?.message}` })
        return null
      }
    })

    ipcMain.handle('llamacpp:start', async () => {
      try {
        sendToRenderer('status:llamacpp', 'starting')
        const result = await startLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('status:llamacpp', 'started')
        sendToRenderer('llamacpp:ready', result)
        // Notify webview to register llama-server as OpenAI endpoint
        if (result.url) {
          sendToRenderer('connections:openai', {
            action: 'add',
            url: `${result.url}/v1`
          })
          // Refresh model list after backend registers the endpoint
          setTimeout(() => sendToRenderer('models:refresh'), 1000)
        }
        await setConfig({ llamaCpp: { ...CONFIG?.llamaCpp, enabled: true } })
        CONFIG = await getConfig()
        return result
      } catch (error) {
        log.error('Failed to start llamacpp:', error)
        sendToRenderer('status:llamacpp', 'failed')
        sendToRenderer('error', { message: `llamacpp failed: ${error?.message}` })
        return null
      }
    })

    ipcMain.handle('llamacpp:stop', async () => {
      try {
        const info = getLlamaCppInfo()
        await stopLlamaCpp()
        sendToRenderer('status:llamacpp', 'stopped')
        // Notify webview to unregister llama-server
        if (info.url) {
          sendToRenderer('connections:openai', {
            action: 'remove',
            url: `${info.url}/v1`
          })
          // Refresh model list after removing endpoint
          setTimeout(() => sendToRenderer('models:refresh'), 500)
        }
        await setConfig({ llamaCpp: { ...CONFIG?.llamaCpp, enabled: false } })
        CONFIG = await getConfig()
        return true
      } catch (error) {
        log.error('Failed to stop llamacpp:', error)
        return false
      }
    })

    ipcMain.handle('llamacpp:info', () => getLlamaCppInfo())
    ipcMain.handle('llamacpp:logs', () => getLlamaCppLog())
    ipcMain.handle('llamacpp:pty:connect', () => connectLlamaCppPtyPort())

    ipcMain.handle('llamacpp:uninstall', async () => {
      try {
        const info = getLlamaCppInfo()
        await uninstallLlamaCpp()
        sendToRenderer('status:llamacpp', null)
        // Unregister OpenAI endpoint if it was running
        if (info.url) {
          sendToRenderer('connections:openai', {
            action: 'remove',
            url: `${info.url}/v1`
          })
          setTimeout(() => sendToRenderer('models:refresh'), 500)
        }
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
      if (repo && filename) {
        return cancelDownloadForFile(repo, filename)
      }
      cancelDownload()
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
      return uninstallPackage(packageName)
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
        sendToRenderer('status:llamacpp', 'setting-up')
        const result = await updateLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('status:llamacpp', 'ready')
        return result
      } catch (error) {
        log.error('Failed to update llamacpp:', error)
        sendToRenderer('status:llamacpp', 'failed')
        sendToRenderer('error', { message: `llamacpp update failed: ${error?.message}` })
        throw error
      }
    })

    // ─── Startup ──────────────────────────────────────

    // Create tray
    const trayIcon = nativeImage.createFromPath(icon)
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
    tray.setToolTip('Open WebUI')
    updateTray()



    // Global shortcut
    registerShortcuts(CONFIG.globalShortcut, CONFIG.spotlightShortcut, CONFIG.voiceInputShortcut, CONFIG.callShortcut)

    // Enable screen capture
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          callback({ video: sources[0], audio: 'loopback' })
        })
      },
      { useSystemPicker: true }
    )

    // Validate stale PIDs from previous crash
    validateOpenTerminalProcess()
    validateLlamaCppProcess()

    // Auto-start Open Terminal if previously enabled
    if (CONFIG?.openTerminal?.enabled) {
      try {
        sendToRenderer('status:open-terminal', 'starting')
        const result = await startOpenTerminal(CONFIG?.openTerminal?.port ?? null)
        sendToRenderer('status:open-terminal', 'started')
        sendToRenderer('open-terminal:ready', result)
      } catch (error) {
        log.error('Auto-start Open Terminal failed:', error)
        sendToRenderer('status:open-terminal', 'failed')
      }
    }

    // Auto-start llama.cpp if previously enabled
    if (CONFIG?.llamaCpp?.enabled) {
      try {
        sendToRenderer('status:llamacpp', 'starting')
        const result = await startLlamaCpp((status) => {
          sendToRenderer('status:llamacpp-setup', status)
        })
        sendToRenderer('status:llamacpp', 'started')
        sendToRenderer('llamacpp:ready', result)
      } catch (error) {
        log.error('Auto-start llama.cpp failed:', error)
        sendToRenderer('status:llamacpp', 'failed')
      }
    }

    // Check if already configured, auto-connect to default
    if (CONFIG.defaultConnectionId && CONFIG.connections.length > 0) {
      const defaultConn = CONFIG.connections.find(
        (c) => c.id === CONFIG.defaultConnectionId
      )
      if (defaultConn) {
        createMainWindow()
        const result = await connectTo(defaultConn)
        if (result) sendToRenderer('connection:open', result)
      } else {
        createMainWindow()
      }
    } else {
      createMainWindow()
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

  app.on('before-quit', async () => {
    isQuiting = true
    await stopLlamaCpp()
    await stopOpenTerminal()
    await stopServerHandler()
    globalShortcut.unregisterAll()
    mainWindow = null
    contentWindow = null
    if (spotlightWindow && !spotlightWindow.isDestroyed()) {
      spotlightWindow.destroy()
    }
    spotlightWindow = null
    if (voiceInputWindow && !voiceInputWindow.isDestroyed()) {
      voiceInputWindow.destroy()
    }
    voiceInputWindow = null
    tray?.destroy()
    tray = null
  })
}
