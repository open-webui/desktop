import path from 'path'

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_SCHEMES.has(parsed.protocol)
  } catch {
    return false
  }
}

export function isPathInside(target: string, roots: string[]): boolean {
  const resolved = path.resolve(target)
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root)
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  })
}

export function normalizeOpenUrl(url: string): string {
  if (url.startsWith('http://0.0.0.0')) {
    return url.replace('http://0.0.0.0', 'http://localhost')
  }
  return url
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) {
    throw new Error('No URL provided to open in browser.')
  }
  const normalized = normalizeOpenUrl(url)
  if (!isAllowedExternalUrl(normalized)) {
    throw new Error('Blocked opening a URL with a disallowed scheme')
  }
  const { shell } = await import('electron')
  await shell.openExternal(normalized)
}
