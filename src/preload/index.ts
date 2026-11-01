import { ipcRenderer, contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { stripVTControlCharacters } from 'node:util'
import type { ServiceId } from '../shared/terminal'

import { createTerminalClient } from './terminalClient'

if (process.platform !== 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    const syncWindowTheme = (): void => {
      ipcRenderer.send('window:theme', document.documentElement.classList.contains('dark'))
    }
    const observer = new MutationObserver(syncWindowTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    syncWindowTheme()
    window.addEventListener('unload', () => observer.disconnect(), { once: true })
  }, { once: true })
}

const terminals = createTerminalClient((service, id) => ipcRenderer.send('terminal:connect', service, id))
window.addEventListener('unload', () => terminals.dispose())
ipcRenderer.on('terminal:port', (event, id: number) => {
  const [port] = event.ports
  if (port) terminals.accept(id, port)
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
  getInstallDir: () => ipcRenderer.invoke('app:installDir'),
  getContentPreloadPath: () => ipcRenderer.invoke('app:contentPreloadPath'),
  getDiskSpace: () => ipcRenderer.invoke('system:diskSpace'),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:launchAtLogin:get'),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke('app:launchAtLogin:set', enabled),
  openInBrowser: (url: string) => ipcRenderer.invoke('open:browser', { url }),
  openPath: (folderPath: string) => ipcRenderer.invoke('open:path', folderPath),
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

  connectTerminal: terminals.connect,
  disconnectTerminal: terminals.disconnect,
  writeTerminal: terminals.write,
  resizeTerminal: terminals.resize,
  onTerminalLine: (service: ServiceId, callback: (line: string) => void) => {
    let tail = ''
    const id = terminals.connect(service, (message, consumed) => {
      tail = message.type === 'reset' ? '' : (tail + message.data).slice(-16384)
      // Keep split escape sequences in the buffer, but don't show an unfinished color code.
      const plain = stripVTControlCharacters(tail.replace(/\x1b(?:\[[0-?]*[ -/]*)?$/, ''))
      callback(plain.split(/[\r\n]/).findLast((line) => line.trim())?.trim() ?? '')
      consumed()
    })
    return () => terminals.disconnect(id)
  },

  // llama.cpp
  setupLlamaCpp: () => ipcRenderer.invoke('llamacpp:setup'),
  startLlamaCpp: () => ipcRenderer.invoke('llamacpp:start'),
  stopLlamaCpp: () => ipcRenderer.invoke('llamacpp:stop'),
  getLlamaCppInfo: () => ipcRenderer.invoke('llamacpp:info'),
  getLlamaCppAssetName: (variant?: string) => ipcRenderer.invoke('llamacpp:asset-name', variant),
  getLlamaCppLogs: () => ipcRenderer.invoke('llamacpp:logs'),
  checkLlamaCppUpdate: () => ipcRenderer.invoke('llamacpp:check-update'),
  updateLlamaCpp: () => ipcRenderer.invoke('llamacpp:update'),
  uninstallLlamaCpp: () => ipcRenderer.invoke('llamacpp:uninstall'),

  // Hugging Face models
  listHfModels: () => ipcRenderer.invoke('huggingface:models:list'),
  getHfModelsDir: () => ipcRenderer.invoke('huggingface:models:dir'),
  downloadHfModel: (repo: string, filename: string, token?: string, expectedSize?: number) =>
    ipcRenderer.invoke('huggingface:models:download', repo, filename, token, expectedSize),
  deleteHfModel: (repo: string, filename: string) =>
    ipcRenderer.invoke('huggingface:models:delete', repo, filename),
  cancelHfDownload: (repo?: string, filename?: string) =>
    ipcRenderer.invoke('huggingface:models:cancel', repo, filename),
  searchHfModels: (query: string, token?: string) =>
    ipcRenderer.invoke('huggingface:search', query, token),
  getHfRepoFiles: (repo: string, token?: string) =>
    ipcRenderer.invoke('huggingface:repo:files', repo, token),

  // Package
  getPackageVersion: (packageName: string) => ipcRenderer.invoke('package:version', packageName),
  uninstallPackage: (packageName: string) => ipcRenderer.invoke('package:uninstall', packageName),

  openLocalWebUI: () => ipcRenderer.invoke('server:open'),

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
