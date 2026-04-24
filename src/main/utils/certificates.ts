export interface CertificateConnection {
  type: 'local' | 'remote'
  url: string
  allowSelfSigned?: boolean
}

const DEFAULT_VERIFICATION_RESULT = -3
const ALLOW_VERIFICATION_RESULT = 0

const normalizeHostname = (hostname: string): string => hostname.trim().toLowerCase()

export const parseHostnameFromUrl = (value: string): string | null => {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null

  const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  try {
    const hostname = new URL(normalizedUrl).hostname
    return hostname ? normalizeHostname(hostname) : null
  } catch {
    return null
  }
}

export const getAllowedSelfSignedHosts = (
  connections: CertificateConnection[] | undefined
): Set<string> => {
  const hosts = new Set<string>()

  for (const connection of connections || []) {
    if (connection.type !== 'remote') continue
    if (connection.allowSelfSigned !== true) continue

    const hostname = parseHostnameFromUrl(connection.url)
    if (!hostname) continue

    hosts.add(hostname)
  }

  return hosts
}

export const getCertificateVerificationResult = (
  requestHostname: string | undefined,
  allowedHosts: Set<string>
): number => {
  if (!requestHostname) return DEFAULT_VERIFICATION_RESULT

  const normalized = normalizeHostname(requestHostname)
  if (!normalized) return DEFAULT_VERIFICATION_RESULT

  return allowedHosts.has(normalized) ? ALLOW_VERIFICATION_RESULT : DEFAULT_VERIFICATION_RESULT
}
