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

const api = {
  onData: (callback: (data: any) => void) => {
    ipcRenderer.on('main:data', (_, data) => callback(data))
  },

  // App
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getVersion: () => ipcRenderer.invoke('get:version'),
  resetApp: () => ipcRenderer.invoke('app:reset'),
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

  // Connections
  getConnections: () => ipcRenderer.invoke('connections:list'),
  addConnection: (connection: any) => ipcRenderer.invoke('connections:add', connection),
  removeConnection: (id: string) => ipcRenderer.invoke('connections:remove', id),
  setDefaultConnection: (id: string) => ipcRenderer.invoke('connections:setDefault', id),
  connectTo: (id: string) => ipcRenderer.invoke('connections:connect', id),
  validateUrl: (url: string) => ipcRenderer.invoke('validate:url', url)
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
