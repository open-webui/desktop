import { ipcRenderer, contextBridge } from 'electron'

const api = {
  submitQuery: (query: string): void => {
    ipcRenderer.invoke('spotlight:submit', query)
  },
  closeSpotlight: (): void => {
    ipcRenderer.invoke('spotlight:close')
  },
  onInitialQuery: (callback: (query: string) => void): void => {
    ipcRenderer.on('spotlight:initialQuery', (_event, query: string) => {
      callback(query)
    })
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('spotlightAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.spotlightAPI = api
}
