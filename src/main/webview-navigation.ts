const AUTH_HOSTS = new Set([
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com'
])

const AUTH_HOST_SUFFIXES = ['.cloudflareaccess.com']

const AUTH_PATH =
  /\/cdn-cgi\/access(?:\/|$)|\/application\/o\/|\/if\/flow\/|\/realms\/|\/oauth2?\/|\/oidc\/|\/saml2?\/|\/login\/oauth|\/authorize\/?$/i

export function loggableUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return '(invalid url)'
  }
}

export function isAccessCallbackUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return (
      path.includes('/cdn-cgi/access/callback') ||
      path.includes('/cdn-cgi/access/authorized')
    )
  } catch {
    return false
  }
}

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.hostname === '0.0.0.0') {
      parsed.hostname = '127.0.0.1'
    }
    return parsed.origin
  } catch {
    return null
  }
}

export function isLikelyAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (AUTH_HOSTS.has(host)) return true
    if (AUTH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
    if (host === 'github.com' && parsed.pathname.toLowerCase().startsWith('/login')) return true
    if (AUTH_PATH.test(parsed.pathname)) return true
    const query = parsed.searchParams
    if (query.has('client_id') && (query.has('redirect_uri') || query.has('response_type'))) {
      return true
    }
    if (query.has('SAMLRequest') || query.has('SAMLResponse')) return true
    return false
  } catch {
    return false
  }
}

/**
 * Chat links from the Open WebUI origin should open in the OS browser (#165).
 * Cloudflare Access / OIDC / SAML must stay in the webview partition so the
 * session cookie is set on the guest, not in Chrome.
 */
export function shouldOpenInSystemBrowser(opts: {
  currentUrl: string
  targetUrl: string
  homeOrigin: string | null
}): boolean {
  const targetOrigin = originOf(opts.targetUrl)
  if (!targetOrigin) return false

  const currentOrigin = originOf(opts.currentUrl)
  if (!currentOrigin) return false

  if (targetOrigin === currentOrigin) return false
  if (opts.homeOrigin && targetOrigin === opts.homeOrigin) return false
  if (isLikelyAuthUrl(opts.targetUrl) || isLikelyAuthUrl(opts.currentUrl)) return false
  if (opts.homeOrigin && currentOrigin !== opts.homeOrigin) return false

  return true
}
