import { ipcRenderer, contextBridge } from 'electron'

// Guest Open WebUI is untrusted (remote URL or XSS in the local UI).
// Only these send() types are forwarded to the embedder — keep in sync
// with src/renderer/src/lib/guest-protocol.ts.
const ALLOWED_SEND_TYPES = new Set(['token:update', 'app:info', 'app:data', 'window:isFocused'])
const ALLOWED_LOAD_PAGES = new Set(['home', 'welcome', 'connected', 'settings'])

type EventCallback = (data: unknown) => void
const eventCallbacks: EventCallback[] = []

// Embedder → Guest (push events from desktop)
ipcRenderer.on('desktop:event', (_event, data) => {
  eventCallbacks.forEach((cb) => cb(data))
})

// ─── Theme Sync: Open WebUI → Desktop ───────────────────
// Open WebUI calls window.applyTheme() after every theme change.
// We inject this hook so the desktop shell can mirror the theme.
contextBridge.exposeInMainWorld('applyTheme', () => {
  const theme = localStorage.getItem('theme') ?? 'system'
  ipcRenderer.sendToHost('webview:event', { type: 'theme:update', data: { theme } })
})

contextBridge.exposeInMainWorld('electronAPI', {
  onEvent: (callback: EventCallback): void => {
    eventCallbacks.push(callback)
  },

  send: (data: { type?: string }): Promise<unknown> => {
    if (!data || !ALLOWED_SEND_TYPES.has(data.type ?? '')) {
      return Promise.reject(
        new Error(`Unsupported desktop request: ${data?.type ?? '(missing type)'}`)
      )
    }
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      const handler = (
        _event: unknown,
        response: { _responseId?: string; data?: unknown }
      ): void => {
        if (response?._responseId === id) {
          ipcRenderer.removeListener('desktop:response', handler)
          resolve(response.data)
        }
      }
      ipcRenderer.on('desktop:response', handler)
      ipcRenderer.sendToHost('webview:send', { ...data, _requestId: id })
    })
  },

  load: (page: string): void => {
    if (!ALLOWED_LOAD_PAGES.has(page)) return
    ipcRenderer.sendToHost('webview:load', page)
  }
})
