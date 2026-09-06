import { app } from 'electron'
import log from 'electron-log'

function hostnameIsLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function isTrustedInsecureOrigin(url: string, configuredUrls: string[]): boolean {
  const target = originOf(url)
  if (!target) return false

  try {
    if (hostnameIsLoopback(new URL(url).hostname)) return true
  } catch {
    return false
  }

  for (const configured of configuredUrls) {
    const origin = originOf(configured)
    if (origin && origin === target) return true
  }
  return false
}

/**
 * Trust extra certificates only for origins the user added as connections
 * (and loopback). Default Chromium PKI stays in force for GitHub, HF,
 * auto-update, and everything else.
 */
export function registerCertificatePolicy(getConfiguredUrls: () => string[]): void {
  app.on('certificate-error', (event, _webContents, url, error, certificate, callback) => {
    const allow = isTrustedInsecureOrigin(url, getConfiguredUrls())
    log.warn(
      `Certificate error: ${error} for ${url} ` +
        `(subject: ${certificate.subjectName}, issuer: ${certificate.issuerName}) ` +
        `→ ${allow ? 'allow (configured origin)' : 'reject'}`
    )
    if (allow) {
      event.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
  })
}
