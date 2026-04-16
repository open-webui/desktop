// @ts-nocheck

/**
 * Reusable Hugging Face utility module.
 * Downloads files from HF repos, manages a local model cache,
 * and provides listing/deletion of cached models.
 *
 * Cache dir: <userData>/models/huggingface/<repo-slug>/<filename>
 */

import * as fs from 'fs'
import * as path from 'path'
import log from 'electron-log'

import { getInstallDir, downloadFileWithProgress } from './index'

// ─── Types ──────────────────────────────────────────────

export interface HfModel {
  repo: string
  filename: string
  filepath: string
  size: number // bytes
  downloadedAt: string // ISO date
}

export interface HfDownloadProgress {
  percent: number
  downloadedBytes: number
  totalBytes: number
}

// ─── Paths ──────────────────────────────────────────────

const getHfCacheDir = (): string => {
  const dir = path.join(getInstallDir(), 'models', 'huggingface')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

const repoSlug = (repo: string): string => repo.replace(/\//g, '--')

const getManifestPath = (): string => path.join(getHfCacheDir(), 'manifest.json')

// ─── Manifest ───────────────────────────────────────────

const readManifest = (): HfModel[] => {
  const p = getManifestPath()
  if (!fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

const writeManifest = (models: HfModel[]): void => {
  fs.writeFileSync(getManifestPath(), JSON.stringify(models, null, 2))
}

// ─── Public API ─────────────────────────────────────────

const activeDownloadAborts = new Map<string, AbortController>()

const getDownloadKey = (repo: string, filename: string): string => `${repo}::${filename}`

/**
 * Cancel the current download in progress.
 */
export const cancelDownload = (): void => {
  for (const controller of activeDownloadAborts.values()) {
    controller.abort()
  }
  activeDownloadAborts.clear()
}

export const cancelDownloadForFile = (repo: string, filename: string): boolean => {
  const key = getDownloadKey(repo, filename)
  const controller = activeDownloadAborts.get(key)
  if (!controller) return false
  controller.abort()
  activeDownloadAborts.delete(key)
  return true
}

/**
 * List all downloaded models.
 */
export const listModels = (): HfModel[] => {
  const manifest = readManifest()
  // Filter out entries whose files no longer exist
  return manifest.filter((m) => fs.existsSync(m.filepath))
}

/**
 * Get the cache directory path (so runtimes can reference it).
 */
export const getModelsDir = (): string => {
  const dir = path.join(getInstallDir(), 'models')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Download a file from a Hugging Face repository.
 *
 * @param repo     - HF repo, e.g. "ggml-org/gemma-3-1b-it-GGUF"
 * @param filename - File to download, e.g. "gemma-3-1b-it-Q4_K_M.gguf"
 * @param onProgress - Progress callback
 * @param token    - Optional HF access token for private repos
 * @returns Absolute path to the downloaded file
 */
export const downloadModel = async (
  repo: string,
  filename: string,
  onProgress?: (progress: HfDownloadProgress) => void,
  token?: string,
  expectedSize?: number
): Promise<string> => {
  const key = getDownloadKey(repo, filename)
  if (activeDownloadAborts.has(key)) {
    throw new Error(`Download already in progress for ${repo}/${filename}`)
  }

  const slug = repoSlug(repo)
  const repoDir = path.join(getHfCacheDir(), slug)
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true })
  }

  const destPath = path.join(repoDir, filename)

  // Already downloaded?
  if (fs.existsSync(destPath)) {
    log.info(`[huggingface] Already cached: ${destPath}`)
    return destPath
  }

  // Build download URL
  const downloadUrl = `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(filename)}`

  log.info(`[huggingface] Downloading ${repo}/${filename}`)
  log.info(`[huggingface] URL: ${downloadUrl}`)

  // Download with progress
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const downloadAbort = new AbortController()
  activeDownloadAborts.set(key, downloadAbort)
  const { signal } = downloadAbort

  const tmpPath = destPath + '.tmp'
  const writeStream = fs.createWriteStream(tmpPath)
  let downloadedBytes = 0

  try {
    // Use fetch for streaming download with progress
    const response = await fetch(downloadUrl, {
      headers,
      redirect: 'follow',
      signal
    })

    if (!response.ok) {
      throw new Error(
        `Failed to download ${repo}/${filename}: ${response.status} ${response.statusText}`
      )
    }

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10)
    const totalBytes = contentLength || expectedSize || 0
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      writeStream.write(Buffer.from(value))
      downloadedBytes += value.byteLength

      if (onProgress && totalBytes > 0) {
        onProgress({
          percent: (downloadedBytes / totalBytes) * 100,
          downloadedBytes,
          totalBytes
        })
      }
    }
  } catch (err) {
    writeStream.end()
    // Clean up partial download
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
    throw err
  } finally {
    writeStream.end()
    await new Promise((resolve) => writeStream.on('finish', resolve))
    activeDownloadAborts.delete(key)
  }

  // Rename tmp to final
  fs.renameSync(tmpPath, destPath)

  // Update manifest
  const manifest = readManifest()
  const existing = manifest.findIndex((m) => m.repo === repo && m.filename === filename)
  const entry: HfModel = {
    repo,
    filename,
    filepath: destPath,
    size: fs.statSync(destPath).size,
    downloadedAt: new Date().toISOString()
  }
  if (existing >= 0) {
    manifest[existing] = entry
  } else {
    manifest.push(entry)
  }
  writeManifest(manifest)

  log.info(`[huggingface] Downloaded: ${destPath} (${entry.size} bytes)`)
  return destPath
}

/**
 * Delete a downloaded model.
 */
export const deleteModel = (repo: string, filename: string): boolean => {
  const slug = repoSlug(repo)
  const filepath = path.join(getHfCacheDir(), slug, filename)

  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
    }
  } catch (e) {
    log.error(`[huggingface] Failed to delete ${filepath}:`, e)
    return false
  }

  // Remove from manifest
  const manifest = readManifest()
  const updated = manifest.filter((m) => !(m.repo === repo && m.filename === filename))
  writeManifest(updated)

  // Clean up empty repo dir
  const repoDir = path.join(getHfCacheDir(), slug)
  try {
    const remaining = fs.readdirSync(repoDir)
    if (remaining.length === 0) {
      fs.rmdirSync(repoDir)
    }
  } catch {}

  log.info(`[huggingface] Deleted: ${repo}/${filename}`)
  return true
}

/**
 * Get info about a specific model.
 */
export const getModelInfo = (repo: string, filename: string): HfModel | null => {
  const manifest = readManifest()
  return manifest.find((m) => m.repo === repo && m.filename === filename) ?? null
}

// ─── HF API Integration ────────────────────────────────

export interface HfRepoResult {
  id: string // e.g. "ggml-org/gemma-3-1b-it-GGUF"
  author: string
  modelId: string
  downloads: number
  likes: number
  tags: string[]
  lastModified: string
}

export interface HfFileInfo {
  filename: string
  size: number // bytes
  lfs?: { size: number }
}

/**
 * Search HF for GGUF model repos.
 */
export const searchModels = async (query: string, token?: string): Promise<HfRepoResult[]> => {
  const params = new URLSearchParams({
    search: query,
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '20'
  })

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`https://huggingface.co/api/models?${params}`, { headers })
  if (!response.ok) {
    throw new Error(`HF search failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.map((item: any) => ({
    id: item.id ?? item.modelId,
    author: item.author ?? item.id?.split('/')[0] ?? '',
    modelId: item.modelId ?? item.id,
    downloads: item.downloads ?? 0,
    likes: item.likes ?? 0,
    tags: item.tags ?? [],
    lastModified: item.lastModified ?? ''
  }))
}

/**
 * List GGUF files in a HF repo.
 */
export const getRepoFiles = async (repo: string, token?: string): Promise<HfFileInfo[]> => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const treeResponse = await fetch(
    `https://huggingface.co/api/models/${repo}/tree/main?recursive=1`,
    { headers }
  )
  if (treeResponse.ok) {
    const treeData = await treeResponse.json()
    const treeFiles = (Array.isArray(treeData) ? treeData : [])
      .filter(
        (f: any) => f.type === 'file' && typeof f.path === 'string' && f.path.endsWith('.gguf')
      )
      .map((f: any) => ({
        filename: f.path,
        size: f.lfs?.size ?? f.size ?? 0
      }))
      .sort((a: HfFileInfo, b: HfFileInfo) => a.size - b.size)

    if (treeFiles.length > 0) {
      return treeFiles
    }
  }

  const response = await fetch(`https://huggingface.co/api/models/${repo}`, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch repo info: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const siblings = data.siblings ?? []

  return siblings
    .filter((f: any) => f.rfilename?.endsWith('.gguf'))
    .map((f: any) => ({
      filename: f.rfilename,
      size: f.lfs?.size ?? f.size ?? 0
    }))
    .sort((a: HfFileInfo, b: HfFileInfo) => a.size - b.size)
}
