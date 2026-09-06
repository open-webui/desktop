/**
 * Desktop ↔ Open WebUI guest protocol.
 *
 * The <webview> guest (local or remote Open WebUI) is untrusted. It may only
 * send these request types; the embedder must never index window.electronAPI
 * with a guest-supplied string.
 *
 * Keep GUEST_SEND_TYPES in sync with src/preload/content-preload.ts.
 */

export const GUEST_SEND_TYPES = [
  'token:update',
  'app:info',
  'app:data',
  'window:isFocused'
] as const

export type GuestSendType = (typeof GUEST_SEND_TYPES)[number]

export const GUEST_LOAD_PAGES = ['home', 'welcome', 'connected', 'settings'] as const

export type GuestLoadPage = (typeof GUEST_LOAD_PAGES)[number]

export const GUEST_THEME_EVENTS = ['theme:update'] as const

export function isGuestSendType(type: unknown): type is GuestSendType {
  return typeof type === 'string' && (GUEST_SEND_TYPES as readonly string[]).includes(type)
}

export function isGuestLoadPage(page: unknown): page is GuestLoadPage {
  return typeof page === 'string' && (GUEST_LOAD_PAGES as readonly string[]).includes(page)
}

export function isGuestThemeEvent(type: unknown): boolean {
  return typeof type === 'string' && (GUEST_THEME_EVENTS as readonly string[]).includes(type)
}

export type GuestSendRequest = {
  type?: string
  token?: unknown
  _requestId?: string
}

/**
 * Handle an allowlisted guest request. Unknown types return undefined and
 * must not be forwarded to the privileged shell API.
 */
export async function handleGuestSend(
  request: GuestSendRequest,
  api: {
    setAuthToken: (token: string) => Promise<unknown> | unknown
    getAppInfo: () => Promise<{
      version?: string
      platform?: string
      arch?: string
      username?: string
    }>
    isWindowFocused: () => Promise<{ isFocused: boolean }>
  }
): Promise<unknown> {
  if (!isGuestSendType(request.type)) {
    console.warn('[webview] ignored untrusted request type:', request.type)
    return undefined
  }

  switch (request.type) {
    case 'token:update':
      if (typeof request.token === 'string' && request.token.length > 0) {
        await api.setAuthToken(request.token)
      }
      return undefined
    case 'app:info': {
      const info = await api.getAppInfo()
      // Do not relay OS username (or any other extra fields) to the guest.
      return {
        version: info?.version,
        platform: info?.platform,
        arch: info?.arch
      }
    }
    case 'app:data':
      // Open WebUI +layout.svelte does `if (data) appData.set(data)` but does
      // not import the appData store (open-webui/desktop#26). A truthy value
      // (`{}`) throws ReferenceError and the UI never mounts. `null` skips
      // that branch. Never return config.json (API keys, envVars, paths).
      return null
    case 'window:isFocused':
      return api.isWindowFocused()
  }
}
