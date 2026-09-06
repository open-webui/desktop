
/**
 * Reusable Hugging Face utility module.
 * Downloads files from HF repos, manages a local model cache,
 * and provides listing/deletion of cached models.
 *
 * Cache dir: <userData>/models/<repo-slug>/<filename>
 */

import * as fs from 'fs'
import * as path from 'path'
import log from 'electron-log'

import { getInstallDir } from './index'
import {
  confinedModelPath,
  huggingfaceDownloadUrl,
  huggingfaceRepoApiUrl,
  assertSafeFilename
} from './hf-paths'
import {
  parseHfLfsSha256,
  fileMatchesSha256,
  downloadAndVerifySha256
} from './artifact-integrity'

// ─── Types ──────────────────────────────────────────────

export interface HfModel {
  repo: string
  filename: string
  filepath: string
  size: number        // bytes
  downloadedAt: string // ISO date
  sha256?: string
}

export interface HfDownloadProgress {
  percent: number
  downloadedBytes: number
  totalBytes: number
}

// ─── Paths ──────────────────────────────────────────────

const getHfCacheDir = (): string => {
  const dir = path.join(getInstallDir(), 'models')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Migrate models from legacy models/huggingface/<slug>/ to models/<slug>/
  const legacyDir = path.join(dir, 'huggingface')
  if (fs.existsSync(legacyDir)) {
    try {
      const entries = fs.readdirSync(legacyDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const src = path.join(legacyDir, entry.name)
          const dest = path.join(dir, entry.name)
          if (!fs.existsSync(dest)) {
            fs.renameSync(src, dest)
            log.info(`[huggingface] Migrated ${entry.name} from legacy cache`)
          }
        }
      }
      // Remove legacy dir if empty (manifest.json may remain)
      const remaining = fs.readdirSync(legacyDir)
      if (remaining.length === 0) {
        fs.rmdirSync(legacyDir)
        log.info('[huggingface] Removed empty legacy huggingface/ directory')
      }
    } catch (e) {
      log.warn('[huggingface] Failed to migrate legacy cache:', e)
    }
  }

  return dir
}

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

const activeDownloads = new Map<string, AbortController>()

const downloadKey = (repo: string, filename: string): string => `${repo}/${filename}`

/**
 * Cancel a specific download in progress.
 * If no repo/filename given, cancels ALL active downloads.
 */
export const cancelDownload = (repo?: string, filename?: string): void => {
  if (repo && filename) {
    const key = downloadKey(repo, filename)
    const ctrl = activeDownloads.get(key)
    if (ctrl) {
      ctrl.abort()
      activeDownloads.delete(key)
    }
  } else {
    // Cancel all
    for (const ctrl of activeDownloads.values()) {
      ctrl.abort()
    }
    activeDownloads.clear()
  }
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
  _expectedSize?: number
): Promise<string> => {
  const destPath = confinedModelPath(getHfCacheDir(), repo, filename)
  const repoDir = path.dirname(destPath)
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true })
  }

  const expectedSha256 = await fetchHfGgufSha256(repo, filename, token)

  if (fs.existsSync(destPath)) {
    if (fileMatchesSha256(destPath, expectedSha256)) {
      log.info(`[huggingface] Using verified cache: ${repo}/${filename}`)
      recordManifest(repo, filename, destPath, expectedSha256)
      return destPath
    }
    log.warn(`[huggingface] Cached GGUF failed SHA-256; re-downloading ${repo}/${filename}`)
    try {
      fs.unlinkSync(destPath)
    } catch {
      /* ignore */
    }
  }

  const downloadUrl = huggingfaceDownloadUrl(repo, filename)
  log.info(`[huggingface] Downloading ${repo}/${filename}`)

  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const key = downloadKey(repo, filename)
  activeDownloads.get(key)?.abort()

  const abortController = new AbortController()
  activeDownloads.set(key, abortController)

  try {
    await downloadAndVerifySha256(
      downloadUrl,
      destPath,
      expectedSha256,
      onProgress
        ? (percent, downloadedBytes, totalBytes) => {
            onProgress({ percent, downloadedBytes, totalBytes })
          }
        : undefined,
      { headers, signal: abortController.signal }
    )
  } finally {
    activeDownloads.delete(key)
  }

  const entry = recordManifest(repo, filename, destPath, expectedSha256)
  log.info(`[huggingface] Downloaded and verified: ${repo}/${filename} (${entry.size} bytes)`)
  return destPath
}

const recordManifest = (
  repo: string,
  filename: string,
  destPath: string,
  sha256: string
): HfModel => {
  const manifest = readManifest()
  const existing = manifest.findIndex((m) => m.repo === repo && m.filename === filename)
  const entry: HfModel = {
    repo,
    filename,
    filepath: destPath,
    size: fs.statSync(destPath).size,
    downloadedAt: new Date().toISOString(),
    sha256
  }
  if (existing >= 0) {
    manifest[existing] = entry
  } else {
    manifest.push(entry)
  }
  writeManifest(manifest)
  return entry
}

/**
 * Delete a downloaded model.
 */
export const deleteModel = (repo: string, filename: string): boolean => {
  const filepath = confinedModelPath(getHfCacheDir(), repo, filename)

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
  const repoDir = path.dirname(filepath)
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
  id: string            // e.g. "ggml-org/gemma-3-1b-it-GGUF"
  author: string
  modelId: string
  downloads: number
  likes: number
  tags: string[]
  lastModified: string
}

export interface HfFileInfo {
  filename: string
  size: number          // bytes
  sha256?: string
  lfs?: { size: number }
}

/**
 * Search HF for GGUF model repos.
 */
export const searchModels = async (
  query: string,
  token?: string
): Promise<HfRepoResult[]> => {
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
export const getRepoFiles = async (
  repo: string,
  token?: string
): Promise<HfFileInfo[]> => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(huggingfaceRepoApiUrl(repo), { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch repo info: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const siblings = data.siblings ?? []

  return siblings
    .filter((f: { rfilename?: string }) => f.rfilename?.endsWith('.gguf'))
    .map((f: { rfilename: string; size?: number; lfs?: { size?: number; sha256?: string } }) => {
      let sha256: string | undefined
      try {
        sha256 = parseHfLfsSha256(f.lfs)
      } catch {
        sha256 = undefined
      }
      return {
        filename: f.rfilename,
        size: f.lfs?.size ?? f.size ?? 0,
        sha256,
        lfs: f.lfs?.size != null ? { size: f.lfs.size } : undefined
      }
    })
    .sort((a: HfFileInfo, b: HfFileInfo) => a.size - b.size)
}

/**
 * Resolve the GGUF content SHA-256 from the Hub. Fail closed if the file is
 * missing or has no LFS sha256 — git blob ids are not a content hash.
 */
export const fetchHfGgufSha256 = async (
  repo: string,
  filename: string,
  token?: string
): Promise<string> => {
  const safeFile = assertSafeFilename(filename)
  const files = await getRepoFiles(repo, token)
  const match = files.find((f) => f.filename === safeFile)
  if (!match?.sha256) {
    throw new Error(`Hugging Face file is missing LFS SHA-256: ${repo}/${safeFile}`)
  }
  return match.sha256
}

