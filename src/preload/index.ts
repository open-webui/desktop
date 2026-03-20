import { ipcRenderer, contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('main:data', (_event, data) => {
    window.postMessage(
      {
        ...data,
        type: `electron:${data.type}`
      },
      window.location.origin
    )
  })
})

// ─── PTY MessagePort ────────────────────────────────────
// The MessagePort stays in the preload (cannot cross contextBridge).
// We expose simple functions so the renderer never touches the port.
let activePtyPort: MessagePort | null = null
let ptyOutputCallback: ((data: string) => void) | null = null

ipcRenderer.on('pty:port', (event, _data) => {
  const [port] = event.ports
  if (!port) return

  // Clean up previous port
  if (activePtyPort) {
    activePtyPort.close()
  }
  activePtyPort = port

  port.onmessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'output' && ptyOutputCallback) {
      ptyOutputCallback(ev.data.data)
    }
  }
  port.start()
})

// ─── Open Terminal PTY MessagePort ──────────────────────
let activeOtPtyPort: MessagePort | null = null
let otPtyOutputCallback: ((data: string) => void) | null = null

ipcRenderer.on('open-terminal:pty:port', (event, _data) => {
  const [port] = event.ports
  if (!port) return

  if (activeOtPtyPort) {
    activeOtPtyPort.close()
  }
  activeOtPtyPort = port

  port.onmessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'output' && otPtyOutputCallback) {
      otPtyOutputCallback(ev.data.data)
    }
  }
  port.start()
})

// ─── llama.cpp PTY MessagePort ───────────────────────
let activeLsCppPtyPort: MessagePort | null = null
let lsCppPtyOutputCallback: ((data: string) => void) | null = null

ipcRenderer.on('llamacpp:pty:port', (event, _data) => {
  const [port] = event.ports
  if (!port) return

  if (activeLsCppPtyPort) {
    activeLsCppPtyPort.close()
  }
  activeLsCppPtyPort = port

  port.onmessage = (ev: MessageEvent) => {
    if (ev.data?.type === 'output' && lsCppPtyOutputCallback) {
      lsCppPtyOutputCallback(ev.data.data)
    }
  }
  port.start()
})

const api = {
  onData: (callback: (data: any) => void) => {
    const handler = (_: any, data: any): void => callback(data)
    ipcRenderer.on('main:data', handler)
    return () => ipcRenderer.removeListener('main:data', handler)
  },

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getVersion: () => ipcRenderer.invoke('get:version'),
  resetApp: () => ipcRenderer.invoke('app:reset'),
  getDefaultDataPath: () => ipcRenderer.invoke('app:defaultDataPath'),
  getContentPreloadPath: () => ipcRenderer.invoke('app:contentPreloadPath'),
  getDiskSpace: () => ipcRenderer.invoke('system:diskSpace'),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:launchAtLogin:get'),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke('app:launchAtLogin:set', enabled),
  openInBrowser: (url: string) => ipcRenderer.invoke('open:browser', { url }),
  notification: (title: string, body: string) =>
    ipcRenderer.invoke('notification', { title, body }),

  // Config
  getConfig: () => ipcRenderer.invoke('get:config'),
  setConfig: (config: Record<string, any>) => ipcRenderer.invoke('set:config', config),

  // Python/uv
  installPython: () => ipcRenderer.invoke('install:python'),
  getPythonStatus: () => ipcRenderer.invoke('status:python'),

  // Package
  installPackage: () => ipcRenderer.invoke('install:package'),
  getPackageStatus: () => ipcRenderer.invoke('status:package'),

  // Server
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  getServerInfo: () => ipcRenderer.invoke('server:info'),
  getServerLogs: () => ipcRenderer.invoke('server:logs'),
  clearServerLogs: () => ipcRenderer.invoke('server:logs:clear'),

  // PTY — MessagePort stays in preload, renderer uses these functions
  listPtys: () => ipcRenderer.invoke('pty:list'),
  connectPty: (onOutput: (data: string) => void, pid?: number) => {
    ptyOutputCallback = onOutput
    ipcRenderer.invoke('pty:connect', pid)
  },
  writePty: (data: string) => {
    activePtyPort?.postMessage({ type: 'input', data })
  },
  resizePty: (cols: number, rows: number) => {
    activePtyPort?.postMessage({ type: 'resize', cols, rows })
  },
  disconnectPty: () => {
    ptyOutputCallback = null
    if (activePtyPort) {
      activePtyPort.close()
      activePtyPort = null
    }
  },

  // Open Terminal
  startOpenTerminal: () => ipcRenderer.invoke('open-terminal:start'),
  stopOpenTerminal: () => ipcRenderer.invoke('open-terminal:stop'),
  getOpenTerminalInfo: () => ipcRenderer.invoke('open-terminal:info'),
  getOpenTerminalStatus: () => ipcRenderer.invoke('open-terminal:status'),
  connectOpenTerminalPty: (onOutput: (data: string) => void) => {
    otPtyOutputCallback = onOutput
    ipcRenderer.invoke('open-terminal:pty:connect')
  },
  disconnectOpenTerminalPty: () => {
    otPtyOutputCallback = null
    if (activeOtPtyPort) {
      activeOtPtyPort.close()
      activeOtPtyPort = null
    }
  },

  // llama.cpp
  setupLlamaCpp: () => ipcRenderer.invoke('llamacpp:setup'),
  startLlamaCpp: () => ipcRenderer.invoke('llamacpp:start'),
  stopLlamaCpp: () => ipcRenderer.invoke('llamacpp:stop'),
  getLlamaCppInfo: () => ipcRenderer.invoke('llamacpp:info'),
  getLlamaCppLogs: () => ipcRenderer.invoke('llamacpp:logs'),
  connectLlamaCppPty: (onOutput: (data: string) => void) => {
    lsCppPtyOutputCallback = onOutput
    ipcRenderer.invoke('llamacpp:pty:connect')
  },
  disconnectLlamaCppPty: () => {
    lsCppPtyOutputCallback = null
    if (activeLsCppPtyPort) {
      activeLsCppPtyPort.close()
      activeLsCppPtyPort = null
    }
  },
  checkLlamaCppUpdate: () => ipcRenderer.invoke('llamacpp:check-update'),
  updateLlamaCpp: () => ipcRenderer.invoke('llamacpp:update'),

  // Hugging Face models
  listHfModels: () => ipcRenderer.invoke('huggingface:models:list'),
  getHfModelsDir: () => ipcRenderer.invoke('huggingface:models:dir'),
  downloadHfModel: (repo: string, filename: string, token?: string, expectedSize?: number) =>
    ipcRenderer.invoke('huggingface:models:download', repo, filename, token, expectedSize),
  deleteHfModel: (repo: string, filename: string) =>
    ipcRenderer.invoke('huggingface:models:delete', repo, filename),
  cancelHfDownload: () => ipcRenderer.invoke('huggingface:models:cancel'),
  searchHfModels: (query: string, token?: string) =>
    ipcRenderer.invoke('huggingface:search', query, token),
  getHfRepoFiles: (repo: string, token?: string) =>
    ipcRenderer.invoke('huggingface:repo:files', repo, token),

  // Package
  getPackageVersion: (packageName: string) => ipcRenderer.invoke('package:version', packageName),
  uninstallPackage: (packageName: string) => ipcRenderer.invoke('package:uninstall', packageName),

  // Connections
  getConnections: () => ipcRenderer.invoke('connections:list'),
  addConnection: (connection: any) => ipcRenderer.invoke('connections:add', connection),
  removeConnection: (id: string) => ipcRenderer.invoke('connections:remove', id),
  updateConnection: (id: string, updates: any) => ipcRenderer.invoke('connections:update', id, updates),
  setDefaultConnection: (id: string) => ipcRenderer.invoke('connections:setDefault', id),
  connectTo: (id: string) => ipcRenderer.invoke('connections:connect', id),
  validateUrl: (url: string) => ipcRenderer.invoke('validate:url', url),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Changelog
  getChangelog: () => ipcRenderer.invoke('app:changelog')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.electronAPI = api
}
