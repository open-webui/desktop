// @ts-nocheck

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

import * as tar from 'tar'
import { ManagedService, waitForReady } from '../process/managed-service'
import { spawnPty } from '../process/native-pty'
import log from 'electron-log'

import {
  getConfig,
  setConfig,
  getInstallDir,
  portInUse,
  downloadFileWithProgress
} from './index'

import { getModelsDir } from './huggingface'

// ─── State ──────────────────────────────────────────────

export const llamaService = new ManagedService(spawnPty)
llamaService.subscribe((event) => {
  if (event.type === 'output') log.info(event.data.trimEnd())
})

let binaryPath: string | null = null

// ─── Public Getters ─────────────────────────────────────

export const getLlamaCppInfo = () => {
  // Lazily discover a cached binary on cold boot so the UI never falsely
  // reports "not installed" when the files are actually on disk.
  if (!binaryPath) {
    const cacheBase = path.join(getInstallDir(), 'llama.cpp')
    try {
      if (fs.existsSync(cacheBase)) {
        const dirs = fs.readdirSync(cacheBase, { withFileTypes: true })
          .filter((d) => d.isDirectory())
        for (const d of dirs) {
          const found = findBinary(path.join(cacheBase, d.name))
          if (found) {
            binaryPath = found
            break
          }
        }
      }
    } catch {
      // Ignore — best-effort discovery
    }
  }

  // Extract version tag from binaryPath — the tag is the directory name
  // directly under the llama.cpp cache dir, e.g. …/llama.cpp/<tag>/bin/llama-server
  let version: string | null = null
  if (binaryPath) {
    const cacheBase = path.join(getInstallDir(), 'llama.cpp')
    const relative = path.relative(cacheBase, binaryPath)
    const tag = relative.split(path.sep)[0]
    if (tag) version = tag
  }
  return { ...llamaService.info, binaryPath, version }
}

// ─── Asset Resolution ───────────────────────────────────

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/**
 * Detect the best GPU variant for the current platform.
 * Returns the variant string (e.g. 'cuda-12.4', 'vulkan', 'rocm', 'cpu').
 */
const detectBestVariant = (): string => {
  const platform = process.platform

  // macOS: Metal is baked into the macOS binary; no variant choice needed.
  if (platform === 'darwin') return 'cpu'

  // Check for NVIDIA GPU (CUDA)
  try {
    execFileSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      timeout: 5000,
      stdio: 'pipe'
    })
    // NVIDIA GPU detected
    if (platform === 'win32') return 'cuda-12.4'
    // Linux: no CUDA asset currently available, fall through to other checks
  } catch {
    // nvidia-smi not available or no NVIDIA GPU
  }

  // Check for Vulkan support
  try {
    if (platform === 'win32') {
      execFileSync('vulkaninfo', ['--summary'], { timeout: 5000, stdio: 'pipe' })
    } else {
      execFileSync('vulkaninfo', ['--summary'], { timeout: 5000, stdio: 'pipe' })
    }
    return 'vulkan'
  } catch {
    // Vulkan not available
  }

  // Linux: check for ROCm (AMD GPU)
  if (platform === 'linux') {
    try {
      if (fs.existsSync('/opt/rocm') || fs.existsSync('/usr/lib/rocm')) {
        return 'rocm'
      }
    } catch {
      // ROCm not available
    }
  }

  return 'cpu'
}

/**
 * Resolve the variant — if 'auto' or empty, detect the best one.
 */
const resolveVariant = (variant: string | undefined): string => {
  if (!variant || variant === 'auto') {
    const detected = detectBestVariant()
    log.info(`Auto-detected variant: ${detected}`)
    return detected
  }
  return variant
}

/**
 * Determine the correct release asset name for this platform/arch/variant.
 */
const getAssetPattern = (tag: string, variant: string): { pattern: string; isZip: boolean } => {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    const archStr = arch === 'arm64' ? 'arm64' : 'x64'
    return { pattern: `llama-${tag}-bin-macos-${archStr}.tar.gz`, isZip: false }
  }

  if (platform === 'linux') {
    const variantMap: Record<string, string> = {
      cpu: `llama-${tag}-bin-ubuntu-x64.tar.gz`,
      vulkan: `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`,
      rocm: `llama-${tag}-bin-ubuntu-rocm-7.2-x64.tar.gz`
    }
    const name = variantMap[variant] ?? variantMap.cpu
    return { pattern: name, isZip: false }
  }

  if (platform === 'win32') {
    const archStr = arch === 'arm64' ? 'arm64' : 'x64'
    const variantMap: Record<string, string> = {
      cpu: `llama-${tag}-bin-win-cpu-${archStr}.zip`,
      'cuda-12.4': `llama-${tag}-bin-win-cuda-12.4-x64.zip`,
      'cuda-13.1': `llama-${tag}-bin-win-cuda-13.1-x64.zip`,
      vulkan: `llama-${tag}-bin-win-vulkan-x64.zip`
    }
    const name = variantMap[variant] ?? variantMap.cpu
    return { pattern: name, isZip: true }
  }

  return { pattern: `llama-${tag}-bin-ubuntu-x64.tar.gz`, isZip: false }
}

/**
 * Find the llama-server binary inside the extracted directory.
 */
const findBinary = (dir: string): string | null => {
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'

  const candidates = [
    path.join(dir, exeName),
    path.join(dir, 'bin', exeName),
    path.join(dir, 'build', 'bin', exeName)
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = path.join(dir, entry.name, exeName)
        if (fs.existsSync(nested)) return nested
        const nestedBin = path.join(dir, entry.name, 'bin', exeName)
        if (fs.existsSync(nestedBin)) return nestedBin
      }
    }
  } catch {}

  return null
}

// ─── Setup (Download & Extract) ─────────────────────────

let setupTask: Promise<string> | undefined
export const setupLlamaCpp = (onStatus?: (status: string) => void, signal?: AbortSignal): Promise<string> => {
  if (!setupTask) setupTask = prepareLlamaCpp(onStatus, signal).finally(() => { setupTask = undefined })
  return setupTask
}

const prepareLlamaCpp = async (
  onStatus?: (status: string) => void, signal?: AbortSignal
): Promise<string> => {
  signal?.throwIfAborted()
  const config = await getConfig()
  const llamaConfig = config.llamaCpp ?? {}
  const version = llamaConfig.version || 'latest'
  const variant = resolveVariant(llamaConfig.variant)

  const cacheBase = path.join(getInstallDir(), 'llama.cpp')
  if (!fs.existsSync(cacheBase)) {
    fs.mkdirSync(cacheBase, { recursive: true })
  }

  // ── Check for existing cached binary before any network request ──
  // This allows llama.cpp to start offline when previously installed.
  if (version !== 'latest') {
    // Pinned version — check its specific directory
    const pinnedDir = path.join(cacheBase, version)
    const pinnedBinary = fs.existsSync(pinnedDir) ? findBinary(pinnedDir) : null
    if (pinnedBinary) {
      log.info(`Using cached llama-server binary (pinned ${version}): ${pinnedBinary}`)
      binaryPath = pinnedBinary
      onStatus?.('Ready')
      return pinnedBinary
    }
  } else {
    // 'latest' — scan all cached version directories for a usable binary
    try {
      const cachedVersions = fs.readdirSync(cacheBase, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)

      for (const cachedTag of cachedVersions) {
        const cachedBinary = findBinary(path.join(cacheBase, cachedTag))
        if (cachedBinary) {
          log.info(`Found cached llama-server binary (${cachedTag}): ${cachedBinary}`)
          // Still try to fetch release info to see if there's a newer version,
          // but if the network is unavailable, use the cached binary.
          binaryPath = cachedBinary
          break
        }
      }
    } catch {
      // Cache directory scan failed — proceed to network fetch
    }
  }

  onStatus?.('Fetching release info…')
  const apiUrl =
    version === 'latest'
      ? 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'
      : `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${version}`

  let releaseData: any
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
    })
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
    }
    releaseData = await response.json()
  } catch (error) {
    signal?.throwIfAborted()
    // Network unavailable — fall back to cached binary if we found one
    if (binaryPath) {
      log.info('Network unavailable, using cached llama-server binary:', binaryPath)
      onStatus?.('Ready (offline)')
      return binaryPath
    }
    throw new Error(
      `Failed to fetch release info (no internet?) and no cached llama.cpp binary found. ` +
      `Please connect to the internet for the initial llama.cpp installation. ` +
      `Original error: ${error?.message ?? error}`
    )
  }

  const tag = releaseData.tag_name
  log.info(`llama.cpp release tag: ${tag}`)

  const versionDir = path.join(cacheBase, tag)
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true })
  }

  const existingBinary = findBinary(versionDir)
  if (existingBinary) {
    log.info(`llama-server binary already exists: ${existingBinary}`)
    binaryPath = existingBinary
    return existingBinary
  }

  const { pattern, isZip } = getAssetPattern(tag, variant)
  const asset = (releaseData.assets as ReleaseAsset[]).find((a) => a.name === pattern)
  if (!asset) {
    const available = (releaseData.assets as ReleaseAsset[]).map((a) => a.name).join(', ')
    throw new Error(
      `No matching asset found for pattern "${pattern}". Available: ${available}`
    )
  }

  log.info(`Downloading asset: ${asset.name}`)
  onStatus?.(`Downloading ${asset.name}…`)

  const downloadPath = path.join(versionDir, asset.name)
  if (!fs.existsSync(downloadPath)) {
    await downloadFileWithProgress(asset.browser_download_url, downloadPath, (progress) => {
      onStatus?.(`Downloading… ${progress.toFixed(0)}%`)
    }, signal)
  }

  signal?.throwIfAborted()
  onStatus?.('Extracting…')
  log.info(`Extracting ${downloadPath} to ${versionDir}`)

  if (isZip) {
    try {
      if (process.platform === 'win32') {
        execFileSync('powershell', [
          '-Command',
          `Expand-Archive -Path "${downloadPath}" -DestinationPath "${versionDir}" -Force`
        ])
      } else {
        execFileSync('unzip', ['-o', downloadPath, '-d', versionDir])
      }
    } catch (error) {
      throw new Error(`Failed to extract zip: ${error?.message ?? error}`)
    }
  } else {
    await tar.x({ cwd: versionDir, file: downloadPath })
  }

  try {
    fs.unlinkSync(downloadPath)
  } catch {}

  if (process.platform !== 'win32') {
    const binary = findBinary(versionDir)
    if (binary) {
      try {
        fs.chmodSync(binary, 0o755)
      } catch {}
    }
  }

  const resultBinary = findBinary(versionDir)
  if (!resultBinary) {
    throw new Error(`llama-server binary not found after extraction in ${versionDir}`)
  }

  log.info(`llama-server binary ready: ${resultBinary}`)
  binaryPath = resultBinary
  onStatus?.('Ready')
  return resultBinary
}

export const checkLlamaCppUpdate = async (): Promise<{ currentVersion: string | null; latestVersion: string | null; updateAvailable: boolean }> => {
  const currentInfo = getLlamaCppInfo()

  try {
    const response = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
    }
    
    const releaseData = await response.json()
    const latestVersion = releaseData.tag_name
    const currentVersion = currentInfo.version
    
    if (!currentVersion) {
      return { currentVersion: null, latestVersion, updateAvailable: true }
    }
    
    return { 
      currentVersion, 
      latestVersion, 
      updateAvailable: currentVersion !== latestVersion 
    }
  } catch (error) {
    log.error('Failed to check for llama.cpp updates:', error)
    return { 
      currentVersion: currentInfo.version, 
      latestVersion: null, 
      updateAvailable: false 
    }
  }
}

export const updateLlamaCpp = async (
  onStatus?: (status: string) => void
): Promise<{ url?: string; status?: string; pid?: number; binaryPath?: string; version?: string | null }> => {
  // 1. Verify network is available BEFORE destructive operations —
  //    don't delete the old binary if we can't download a replacement.
  onStatus?.('Checking for updates…')
  let releaseTag: string
  try {
    const response = await fetch(
      'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest',
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10000)
      }
    )
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    releaseTag = data.tag_name
  } catch (error) {
    throw new Error(
      `Cannot update llama.cpp: unable to reach GitHub. ` +
      `Please check your internet connection. (${error?.message ?? error})`
    )
  }

  // 2. Stop if running
  await stopLlamaCpp()
  await setupTask?.catch(() => {})
  
  // 3. Clear old cache directory (safe — we verified network above)
  const currentInfo = getLlamaCppInfo()
  if (currentInfo.version) {
    const cacheDir = path.join(getInstallDir(), 'llama.cpp', currentInfo.version)
    if (fs.existsSync(cacheDir)) {
      onStatus?.('Removing old version…')
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      } catch (err) {
        log.error(`Failed to remove old llama.cpp cache at ${cacheDir}:`, err)
      }
    }
  }
  
  // 4. Temporarily enforce 'latest' in config so it fetches the newest
  const config = await getConfig()
  await setConfig({ llamaCpp: { ...config.llamaCpp, version: 'latest' } })
  
  // 5. Download new release
  onStatus?.('Downloading update…')
  await setupLlamaCpp(onStatus)
  
  return getLlamaCppInfo()
}

// ─── Lifecycle ──────────────────────────────────────────

export const startLlamaCpp = (onStatus?: (status: string) => void) => llamaService.start(async (signal) => {
  onStatus?.('Setting up llama.cpp…')
  const binary = await setupLlamaCpp(onStatus, signal)
  signal.throwIfAborted()
  const config = await getConfig()
  const llamaConfig = config.llamaCpp ?? {}
  const host = '127.0.0.1'
  const desiredPort = llamaConfig.port || 18881
  let port = desiredPort
  while (await portInUse(port, host)) {
    signal.throwIfAborted()
    if (++port > desiredPort + 100) throw new Error('No available port found for llama-server')
  }
  const url = `http://${host}:${port}`
  onStatus?.('Starting llama-server…')
  return {
    file: binary,
    args: ['--host', host, '--port', String(port), '--models-dir', getModelsDir(), ...(llamaConfig.extraArgs ?? [])],
    env: { ...process.env, ...(config.envVars ?? {}) }, url,
    ready: (signal) => waitForReady(async (probeSignal) => {
      const response = await fetch(`${url}/health`, { signal: probeSignal })
      if (!response.ok) return false
      const body = await response.json()
      return body.status === 'ok' || body.status === 'no slot available'
    }, signal, 90000)
  }
})

export const stopLlamaCpp = () => llamaService.stop()

/**
 * Uninstall llama.cpp — stop the server and remove all downloaded binaries.
 */
export const uninstallLlamaCpp = async (): Promise<void> => {
  await stopLlamaCpp()
  await setupTask?.catch(() => {})

  const cacheBase = path.join(getInstallDir(), 'llama.cpp')
  if (fs.existsSync(cacheBase)) {
    fs.rmSync(cacheBase, { recursive: true, force: true })
    log.info('Removed llama.cpp directory:', cacheBase)
  }

  binaryPath = null
}
