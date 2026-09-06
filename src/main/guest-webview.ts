import { app } from 'electron'
import { join } from 'path'

const CONTENT_PRELOAD_SUFFIX = join('preload', 'content-preload.js').replace(/\\/g, '/')

function isAllowedGuestSrc(src: string | undefined): boolean {
  if (!src) return false
  try {
    const url = new URL(src)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isContentPreload(preload: string | undefined): boolean {
  if (!preload) return false
  return preload.replace(/\\/g, '/').endsWith(CONTENT_PRELOAD_SUFFIX)
}

/**
 * Force safe webPreferences on every <webview> attach. Guests load
 * user-supplied Open WebUI origins and must never gain Node or an
 * unexpected preload.
 *
 * `will-attach-webview` is a WebContents event (not app). Listen on
 * every contents via `web-contents-created`.
 */
export function registerGuestWebviewPolicy(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInWorker = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false

      if (!isContentPreload(webPreferences.preload)) {
        delete webPreferences.preload
      }

      if (!isAllowedGuestSrc(params.src)) {
        event.preventDefault()
      }
    })
  })
}
