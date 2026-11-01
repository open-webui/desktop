import { ipcRenderer, contextBridge } from 'electron'

// Bridge the embedded WebUI theme, local model events, and allowed requests.

type EventCallback = (data: any) => void
const eventCallbacks: EventCallback[] = []

// Embedder → Guest (push events from desktop)
ipcRenderer.on('desktop:event', (_event, data) => {
  eventCallbacks.forEach((cb) => cb(data))
})

// ─── Theme Sync: Open WebUI → Desktop ───────────────────
let lastTheme = ''
const syncTheme = (): void => {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  const theme = localStorage.getItem('theme') ?? 'system'
  const resolvedTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const background = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ||
    (resolvedTheme === 'dark' ? '#171717' : '#ffffff')
  const signature = JSON.stringify({ theme, resolvedTheme, background })
  if (signature === lastTheme) return
  lastTheme = signature
  ipcRenderer.sendToHost('webview:event', {
    type: 'theme:update', data: { theme, resolvedTheme, background }
  })
}

// Run after WebUI finishes changing its classes, palette, and theme-color metadata.
const scheduleTheme = (): void => queueMicrotask(syncTheme)
contextBridge.exposeInMainWorld('applyTheme', scheduleTheme)
window.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(scheduleTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) observer.observe(meta, { attributes: true, attributeFilter: ['content'] })
  syncTheme()
  window.addEventListener('unload', () => observer.disconnect(), { once: true })
})

// Expose to the Open WebUI page via contextBridge (secure, unforgeable)
contextBridge.exposeInMainWorld('electronAPI', {
  // Push events: desktop → Open WebUI
  onEvent: (callback: EventCallback): void => {
    eventCallbacks.push(callback)
    ipcRenderer.sendToHost('webview:ready')
  },

  // Request/Response: Open WebUI → desktop
  send: (data: any): Promise<any> => {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2)
      const handler = (_event: any, response: any) => {
        if (response?._responseId === id) {
          ipcRenderer.removeListener('desktop:response', handler)
          resolve(response.data)
        }
      }
      ipcRenderer.on('desktop:response', handler)
      ipcRenderer.sendToHost('webview:send', { ...data, _requestId: id })
    })
  }
})
