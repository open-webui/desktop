// @ts-nocheck

import {
  app,
  shell,
  session,
  clipboard,
  nativeImage,
  desktopCapturer,
  BrowserWindow,
  globalShortcut,
  MessageChannelMain,
  Notification,
  Menu,
  ipcMain,
  Tray
} from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import {
  getLogFilePath,
  checkUrlAndOpen,
  clearAllServerLogs,
  getConfig,
  getServerLog,
  getServerPIDs,
  getServerPty,
  installPackage,
  installPython,
  isPackageInstalled,
  isPythonInstalled,
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

import log from 'electron-log'
log.transports.file.resolvePathFn = () => getLogFilePath('main')

import icon from '../../resources/icon.png?asset'

// ─── State ──────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let contentWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuiting = false

let CONFIG: AppConfig | null = null
let SERVER_URL: string | null = null
let SERVER_STATUS: string | null = null
let SERVER_REACHABLE = false
let SERVER_PID: number | null = null

// ─── Windows ────────────────────────────────────────────

function createMainWindow(show = true): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 560,
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
      event.preventDefault()
      mainWindow?.hide()
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
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 560,
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
      event.preventDefault()
      contentWindow?.hide()
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
    click: () => connectTo(conn)
  }))

  const trayMenuTemplate = [
    {
      label: 'Show Controls',
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
  }

  // Normalize URL
  if (url.startsWith('http://0.0.0.0')) {
    url = url.replace('http://0.0.0.0', 'http://localhost')
  }

  sendToRenderer('connection:open', { url, connectionId: connection.id })
  return { url, connectionId: connection.id }
}

// ─── Server Lifecycle ───────────────────────────────────

// Active PTY data listener — when a MessagePort is connected, PTY data
// flows to the port. This disposable gets replaced on each pty:connect.
let activePtyDataDisposable: { dispose: () => void } | null = null

const startServerHandler = async (): Promise<boolean> => {
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
    // No server running — send port with a status message
    log.info('pty:connect — no active server')
    port1.postMessage({ type: 'output', data: '[No active server process]\r\n' })
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
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await resetApp()
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
    log.info('Config:', CONFIG)

    electronApp.setAppUserModelId('com.openwebui.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // ─── IPC Handlers ─────────────────────────────────

    ipcMain.handle('get:version', () => app.getVersion())

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    }))

    ipcMain.handle('get:config', () => getConfig())
    ipcMain.handle('set:config', async (_event, config) => {
      await setConfig(config)
      CONFIG = await getConfig()
      updateTray()
    })

    // Python/uv
    ipcMain.handle('install:python', async () => {
      try {
        const res = await installPython()
        sendToRenderer('status:python', res)
        return res
      } catch (error) {
        sendToRenderer('status:python', false)
        sendToRenderer('error', { message: error?.message ?? 'Python install failed' })
        return false
      }
    })

    ipcMain.handle('status:python', async () => {
      return (await isPythonInstalled()) && (await isUvInstalled())
    })

    // Package
    ipcMain.handle('install:package', async () => {
      try {
        const res = await installPackage('open-webui')
        sendToRenderer('status:package', res)
        return res
      } catch (error) {
        sendToRenderer('status:package', false)
        sendToRenderer('error', { message: error?.message ?? 'Package install failed' })
        return false
      }
    })

    ipcMain.handle('status:package', async () => isPackageInstalled('open-webui'))

    // Server
    ipcMain.handle('server:start', () => startServerHandler())
    ipcMain.handle('server:stop', () => stopServerHandler())
    ipcMain.handle('server:restart', () => startServerHandler())
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

    // Misc
    ipcMain.handle('app:reset', () => resetAppHandler())

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

    ipcMain.handle('notification', async (_event, { title, body }) => {
      new Notification({ title, body }).show()
    })

    // ─── Startup ──────────────────────────────────────

    // Create tray
    const trayIcon = nativeImage.createFromPath(icon)
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
    tray.setToolTip('Open WebUI')
    updateTray()

    // Set up menus
    const defaultMenu = Menu.getApplicationMenu()
    const menuTemplate = defaultMenu ? defaultMenu.items.map((item) => item) : []
    menuTemplate.push({
      label: 'Action',
      submenu: [
        {
          label: 'Reset',
          click: () => resetAppHandler()
        }
      ]
    })
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

    // Global shortcut
    globalShortcut.register('Alt+CommandOrControl+O', () => {
      if (contentWindow && !contentWindow.isDestroyed()) {
        contentWindow.show()
        contentWindow.focus()
      } else {
        mainWindow?.show()
        mainWindow?.focus()
      }
    })

    // Enable screen capture
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          callback({ video: sources[0], audio: 'loopback' })
        })
      },
      { useSystemPicker: true }
    )

    // Check if already configured, auto-connect to default
    if (CONFIG.defaultConnectionId && CONFIG.connections.length > 0) {
      const defaultConn = CONFIG.connections.find(
        (c) => c.id === CONFIG.defaultConnectionId
      )
      if (defaultConn) {
        createMainWindow(false)
        await connectTo(defaultConn)
      } else {
        createMainWindow()
      }
    } else {
      createMainWindow()
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
    await stopServerHandler()
    globalShortcut.unregisterAll()
    mainWindow = null
    contentWindow = null
    tray?.destroy()
    tray = null
  })
}
