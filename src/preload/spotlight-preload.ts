import { ipcRenderer, contextBridge } from 'electron'

const api = {
  submitQuery: (query: string): void => {
    ipcRenderer.invoke('spotlight:submit', query)
  },
  closeSpotlight: (): void => {
    ipcRenderer.invoke('spotlight:close')
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
