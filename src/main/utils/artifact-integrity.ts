import { createHash } from 'crypto'
import {
  createWriteStream,
  existsSync,
  unlinkSync,
  renameSync,
  openSync,
  readSync,
  closeSync
} from 'fs'
import { finished } from 'stream/promises'

/**
 * SHA-256 of python-build-standalone 20260310 install_only tarballs
 * (https://github.com/astral-sh/python-build-standalone/releases/tag/20260310 SHA256SUMS).
 * Only the platform/arch pairs this app actually downloads.
 */
export const PYTHON_SHA256: Record<string, string> = {
  'cpython-3.12.13+20260310-aarch64-apple-darwin-install_only.tar.gz':
    '58038f6643b0c51385aa8af1549d2f6d9598c7a48383b9c74fc65481b2b5e6d5',
  'cpython-3.12.13+20260310-aarch64-pc-windows-msvc-install_only.tar.gz':
    '23a9d18ad7d62e8470f6dfbf3e3ddc8c6a343ec8a07bad0197689f96f024a98f',
  'cpython-3.12.13+20260310-aarch64-unknown-linux-gnu-install_only.tar.gz':
    '872bb2d9959bbcba411af08fa57423d586b779c21c7de70890f99e1c59036efc',
  'cpython-3.12.13+20260310-x86_64-apple-darwin-install_only.tar.gz':
    '09d7bfb7e2684d746e2d44bd800becfd07c4c672de907340d279409a8bca2d8b',
  'cpython-3.12.13+20260310-x86_64-pc-windows-msvc-install_only.tar.gz':
    'b9f9d17a11944c13a3a2798c8b48ec861b2f10710dc345094f567beed4271427',
  'cpython-3.12.13+20260310-x86_64-unknown-linux-gnu-install_only.tar.gz':
    'eddc8bf40c7fca5032acd5de4b89e748e17b16cf61918320a0506c7e450a8df3'
}

const SHA256_HEX = /^[0-9a-f]{64}$/

export function parseGithubDigest(digest: unknown): string {
  if (typeof digest !== 'string' || !digest.startsWith('sha256:')) {
    throw new Error('GitHub release asset is missing a sha256 digest')
  }
  const hex = digest.slice('sha256:'.length).toLowerCase()
  if (!SHA256_HEX.test(hex)) {
    throw new Error(`Invalid GitHub asset digest: ${digest}`)
  }
  return hex
}

/**
 * Hugging Face Hub `siblings[].lfs.sha256` (from `?blobs=true`).
 * Do not use `blobId` / git `oid` — those are the LFS pointer, not the GGUF.
 */
export function parseHfLfsSha256(lfs: unknown): string {
  if (!lfs || typeof lfs !== 'object') {
    throw new Error('Hugging Face file is missing LFS SHA-256')
  }
  const sha = (lfs as { sha256?: unknown }).sha256
  if (typeof sha !== 'string') {
    throw new Error('Hugging Face file is missing LFS SHA-256')
  }
  const hex = sha.toLowerCase()
  if (!SHA256_HEX.test(hex)) {
    throw new Error('Hugging Face file is missing LFS SHA-256')
  }
  return hex
}

export function sha256File(filePath: string): string {
  const hash = createHash('sha256')
  const fd = openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    let n = 0
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n))
    }
    return hash.digest('hex')
  } finally {
    closeSync(fd)
  }
}

export function assertSha256(filePath: string, expectedHex: string): void {
  const actual = sha256File(filePath)
  const expected = expectedHex.toLowerCase()
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${filePath}: expected ${expected}, got ${actual}`)
  }
}

export function fileMatchesSha256(filePath: string, expectedHex: string): boolean {
  try {
    return sha256File(filePath) === expectedHex.toLowerCase()
  } catch {
    return false
  }
}

export async function downloadAndVerifySha256(
  url: string,
  destPath: string,
  expectedHex: string,
  onProgress?: (percent: number, downloaded: number, total: number) => void,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
): Promise<string> {
  const expected = expectedHex.toLowerCase()
  if (!SHA256_HEX.test(expected)) {
    throw new Error('Refusing to download without a SHA-256 digest')
  }
  const tmpPath = destPath + '.tmp'
  const response = await fetch(url, {
    headers: init?.headers,
    signal: init?.signal,
    redirect: 'follow'
  })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const totalSize = parseInt(response.headers.get('content-length') ?? '0', 10)
  const hash = createHash('sha256')
  const writer = createWriteStream(tmpPath)
  const reader = response.body.getReader()
  let downloadedSize = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      downloadedSize += value.byteLength
      if (!writer.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => writer.once('drain', resolve))
      }
      if (onProgress && totalSize) {
        onProgress((downloadedSize / totalSize) * 100, downloadedSize, totalSize)
      }
    }
    writer.end()
    await finished(writer)
  } catch (error) {
    writer.destroy()
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw error
  }

  const actual = hash.digest('hex')
  if (actual !== expected) {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`)
  }

  renameSync(tmpPath, destPath)
  return destPath
}
