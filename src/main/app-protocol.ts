import path from 'path'
import { pathToFileURL } from 'url'
import { isPathInside } from './safe-open'

export const APP_SCHEME = 'app'
export const APP_HOST = 'renderer'

export type ShellPage = 'index.html' | 'spotlight.html' | 'voice-input.html'

export function rendererRoot(): string {
  return path.join(__dirname, '../renderer')
}

export function shellPageUrl(page: ShellPage): string {
  return `${APP_SCHEME}://${APP_HOST}/${page}`
}

/**
 * Map an app:// URL to a file under the renderer out dir, or null if it
 * must not be served (wrong host, traversal, empty path).
 */
export function resolveAppProtocolPath(
  requestUrl: string,
  root: string = rendererRoot()
): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${APP_SCHEME}:`) return null
  if (url.hostname !== APP_HOST) return null
  if (url.port !== '' || url.username || url.password) return null

  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  if (!relative || relative.includes('\0')) return null

  const target = path.resolve(root, relative)
  if (!isPathInside(target, [root])) return null
  return target
}

export function registerAppSchemePrivileges(): void {
  // Lazy require so resolveAppProtocolPath can be unit-tested without Electron.
  const { protocol } = require('electron') as typeof import('electron')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
}

export function registerAppProtocolHandler(): void {
  const { protocol, net } = require('electron') as typeof import('electron')
  protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405 })
    }
    const origin = request.headers.get('Origin')
    if (origin && origin !== `${APP_SCHEME}://${APP_HOST}`) {
      return new Response(null, { status: 403 })
    }
    const target = resolveAppProtocolPath(request.url)
    if (!target) return notFound()
    try {
      return await net.fetch(pathToFileURL(target).href)
    } catch {
      return notFound()
    }
  })
}
