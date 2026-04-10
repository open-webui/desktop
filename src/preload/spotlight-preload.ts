import { ipcRenderer, contextBridge } from 'electron'

const api = {
  submitQuery: (query: string, images?: string[]): void => {
    ipcRenderer.invoke('spotlight:submit', query, images)
  },
  closeSpotlight: (): void => {
    ipcRenderer.invoke('spotlight:close')
  },
  captureRegion: (rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<string | null> => {
    return ipcRenderer.invoke('spotlight:captureRegion', rect)
  },
  savePosition: (offset: { x: number; y: number }): void => {
    ipcRenderer.invoke('spotlight:savePosition', offset)
  },
  onInit: (
    callback: (data: {
      barOffset: { x: number; y: number } | null
      screenSize: { width: number; height: number }
      query: string
    }) => void
  ): void => {
    ipcRenderer.on('spotlight:init', (_event, data) => {
      callback(data)
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
