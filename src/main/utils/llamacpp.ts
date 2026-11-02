// @ts-nocheck

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

import * as tar from 'tar'
import { ManagedService, waitForReady } from '../process/managedService'
import { spawnPty } from '../process/nativePty'
import log from 'electron-log'

import {
  getConfig,
  getProcessEnv,
  setConfig,
  getInstallDir,
  findAvailablePort,
  downloadFileWithProgress,
  verifyFileChecksum
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
          .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
        for (const d of dirs) {
          const found = findInstalledBinary(path.join(cacheBase, d.name))
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
  digest?: string
}

interface LlamaRelease {
  tag_name: string
  assets: ReleaseAsset[]
}

const fetchLlamaRelease = async (version = 'latest', signal?: AbortSignal): Promise<LlamaRelease> => {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  const request = async (url: string) => {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' }, signal: requestSignal
    })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}: ${response.statusText}`)
    return response
  }
  const getRelease = async (tag: string): Promise<LlamaRelease> => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(tag)) throw new Error('Invalid llama.cpp release tag')
    const endpoint = tag === 'latest' ? 'latest' : `tags/${tag}`
    const data = await (await request(`https://api.github.com/repos/ggml-org/llama.cpp/releases/${endpoint}`)).json()
    if (typeof data.tag_name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(data.tag_name) || !Array.isArray(data.assets)) {
      throw new Error('Invalid llama.cpp release metadata')
    }
    return data
  }
  const release = await getRelease(version)
  const nightly = release.assets.find((asset) => asset.name === 'nightly-tag.txt')
  if (!nightly) return release
  // Semantic releases point to the nightly build containing their binaries.
  const tag = (await (await request(nightly.browser_download_url)).text()).trim()
  if (!/^b\d+$/.test(tag)) throw new Error('Invalid llama.cpp nightly tag')
  return getRelease(tag)
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

  // Prefer a working HIP device over Vulkan when the HIP SDK is available.
  if (platform === 'win32' && process.arch === 'x64') {
    try {
      const hipInfo = process.env.HIP_PATH
        ? path.join(process.env.HIP_PATH, 'bin', 'hipInfo.exe')
        : 'hipInfo.exe'
      const devices = execFileSync(hipInfo, [], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        stdio: 'pipe'
      })
      if (/\bgfx(?:103[012]|110[012]|1151|120[01])\b/.test(devices)) return 'rocm'
    } catch {
      // HIP tooling or a compatible device is unavailable; try Vulkan next.
    }
  }

  if (platform === 'linux') {
    try {
      if (fs.existsSync('/opt/rocm') || fs.existsSync('/usr/lib/rocm')) return 'rocm'
    } catch {
      // ROCm not available
    }
  }

  try {
    execFileSync('vulkaninfo', ['--summary'], { timeout: 5000, stdio: 'pipe' })
    return 'vulkan'
  } catch {
    // Vulkan not available
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
const getAssetPattern = (
  tag: string, variant: string, assetName?: string
): { pattern: string; isZip: boolean } => {
  if (assetName?.trim()) {
    const pattern = assetName.trim().replaceAll('${tag}', tag)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*\.(zip|tar\.gz)$/.test(pattern)) {
      throw new Error('Archive filename must be a .zip or .tar.gz filename, without paths or URLs. Use ${tag} for the release tag.')
    }
    return { pattern, isZip: pattern.endsWith('.zip') }
  }
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
      rocm: `llama-${tag}-bin-ubuntu-rocm-10.0-x64.tar.gz`
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
      'cuda-13.3': `llama-${tag}-bin-win-cuda-13.3-x64.zip`,
      'cuda-13.4': `llama-${tag}-bin-win-cuda-13.4-x64.zip`,
      vulkan: `llama-${tag}-bin-win-vulkan-x64.zip`,
      rocm: `llama-${tag}-bin-win-rocm-10.0-x64.zip`
    }
    const name = variantMap[variant] ?? variantMap.cpu
    return { pattern: name, isZip: true }
  }

  return { pattern: `llama-${tag}-bin-ubuntu-x64.tar.gz`, isZip: false }
}

export const getLlamaCppAssetName = (variant?: string): string =>
  getAssetPattern('${tag}', resolveVariant(variant)).pattern

const findReleaseAsset = (release: LlamaRelease, variant: string, assetName?: string): ReleaseAsset | undefined => {
  const { pattern } = getAssetPattern(release.tag_name, variant, assetName)
  const exact = release.assets.find((asset) => asset.name === pattern)
  if (exact || assetName?.trim() || variant !== 'rocm') return exact
  const prefix = `llama-${release.tag_name}-bin-`
  const suffix = process.platform === 'win32'
    ? /^win-(?:rocm-[\d.]+|hip-radeon)-x64\.zip$/
    : process.platform === 'linux' ? /^ubuntu-rocm-[\d.]+-x64\.tar\.gz$/ : null
  return release.assets.find((asset) => asset.name.startsWith(prefix) && suffix?.test(asset.name.slice(prefix.length)))
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

// Keep GPU builds and custom archives separate from existing CPU installations.
const getAssetDir = (versionDir: string, pattern: string): string =>
  path.join(versionDir, '.assets', createHash('sha256').update(pattern).digest('hex'))

const findInstalledBinary = (versionDir: string): string | null => {
  const legacyBinary = findBinary(versionDir)
  if (legacyBinary) return legacyBinary
  const assetsDir = path.join(versionDir, '.assets')
  if (!fs.existsSync(assetsDir)) return null
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const binary = findBinary(path.join(assetsDir, entry.name))
    if (binary) return binary
  }
  return null
}

// ─── Setup (Download & Extract) ─────────────────────────

const installReleaseAsset = async (
  asset: ReleaseAsset, destination: string, onStatus?: (status: string) => void, signal?: AbortSignal
): Promise<void> => {
  signal?.throwIfAborted()
  log.info(`Downloading asset: ${asset.name}`)
  onStatus?.(`Downloading ${asset.name}…`)

  fs.mkdirSync(destination, { recursive: true })
  const downloadPath = path.join(destination, asset.name)
  const checksum = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : ''
  if (fs.existsSync(downloadPath)) {
    try {
      await verifyFileChecksum(downloadPath, checksum)
    } catch {
      fs.unlinkSync(downloadPath)
    }
  }
  if (!fs.existsSync(downloadPath)) {
    await downloadFileWithProgress(asset.browser_download_url, downloadPath, (progress) => {
      onStatus?.(`Downloading… ${progress.toFixed(0)}%`)
    }, signal, checksum)
  }

  signal?.throwIfAborted()
  onStatus?.('Extracting…')
  log.info(`Extracting ${downloadPath} to ${destination}`)

  if (asset.name.endsWith('.zip')) {
    try {
      if (process.platform === 'win32') {
        execFileSync('powershell', [
          '-Command',
          `Expand-Archive -LiteralPath '${downloadPath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`
        ])
      } else {
        execFileSync('unzip', ['-o', downloadPath, '-d', destination])
      }
    } catch (error) {
      throw new Error(`Failed to extract zip: ${error?.message ?? error}`)
    }
  } else {
    await tar.x({ cwd: destination, file: downloadPath })
  }

  try {
    fs.unlinkSync(downloadPath)
  } catch {}
}

let setupTask: Promise<string> | undefined
export const setupLlamaCpp = (onStatus?: (status: string) => void, signal?: AbortSignal, requestedVersion?: string): Promise<string> => {
  if (!setupTask) setupTask = prepareLlamaCpp(onStatus, signal, requestedVersion).finally(() => { setupTask = undefined })
  return setupTask
}

const prepareLlamaCpp = async (
  onStatus?: (status: string) => void, signal?: AbortSignal, requestedVersion?: string
): Promise<string> => {
  signal?.throwIfAborted()
  const config = await getConfig()
  const llamaConfig = config.llamaCpp ?? {}
  let version = requestedVersion || llamaConfig.version || 'latest'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(version)) throw new Error('Invalid llama.cpp version')
  const assetName = llamaConfig.assetName?.trim() || ''
  const variant = assetName ? '' : resolveVariant(llamaConfig.variant)
  const useAssetCache = !!assetName || variant !== 'cpu'
  // Validate before consulting the cache, including offline starts.
  const { pattern: selectedAsset } = getAssetPattern(version, variant, assetName)
  const cuda = process.platform === 'win32'
    ? selectedAsset.match(/-bin-win-(cuda-(\d+)\.\d+-(?:x64|arm64))\.zip$/)
    : null
  const runtimeName = cuda ? `cudart-llama-bin-win-${cuda[1]}.zip` : ''
  const runtimeDlls = cuda ? [`cudart64_${cuda[2]}.dll`, `cublas64_${cuda[2]}.dll`, `cublasLt64_${cuda[2]}.dll`] : []
  const hasRuntime = (binary: string): boolean =>
    runtimeDlls.every((name) => fs.existsSync(path.join(path.dirname(binary), name)))

  const cacheBase = path.join(getInstallDir(), 'llama.cpp')
  if (!fs.existsSync(cacheBase)) {
    fs.mkdirSync(cacheBase, { recursive: true })
  }

  const getCachedBinary = (tag: string): string | null => {
    const versionDir = path.join(cacheBase, tag)
    const { pattern } = getAssetPattern(tag, variant, assetName)
    const binary = findBinary(useAssetCache ? getAssetDir(versionDir, pattern) : versionDir)
    if (binary || assetName || variant !== 'rocm') return binary
    // Preserve offline access to installations cached under the previous defaults.
    const legacyPattern = pattern.replace('-win-rocm-10.0-', '-win-hip-radeon-').replace('-ubuntu-rocm-10.0-', '-ubuntu-rocm-7.2-')
    return findBinary(getAssetDir(versionDir, legacyPattern))
  }
  // ── Check for existing cached binary before any network request ──
  // Startup reuses installed binaries; only an explicit update resolves a newer release.
  if (version !== 'latest') {
    // Pinned version — check its specific directory
    const pinnedBinary = getCachedBinary(version)
    if (pinnedBinary && hasRuntime(pinnedBinary)) {
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
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      for (const cachedTag of cachedVersions) {
        const cachedBinary = getCachedBinary(cachedTag)
        if (cachedBinary) {
          if (!hasRuntime(cachedBinary)) {
            // Repair this installation without implicitly updating to a newer release.
            version = cachedTag
            break
          }
          log.info(`Using cached llama-server binary (${cachedTag}): ${cachedBinary}`)
          binaryPath = cachedBinary
          onStatus?.('Ready')
          return cachedBinary
        }
      }
    } catch {
      // Cache directory scan failed — proceed to network fetch
    }
  }

  onStatus?.('Fetching release info…')
  let releaseData: LlamaRelease
  try {
    releaseData = await fetchLlamaRelease(version, signal)
  } catch (error) {
    signal?.throwIfAborted()
    throw new Error(
      `Failed to fetch release info (no internet?) and no complete cached llama.cpp installation found. ` +
      `Please connect to the internet to install or repair llama.cpp. ` +
      `Original error: ${error?.message ?? error}`
    )
  }

  const tag = releaseData.tag_name
  log.info(`llama.cpp release tag: ${tag}`)

  const { pattern } = getAssetPattern(tag, variant, assetName)
  const releaseDir = path.join(cacheBase, tag)
  const versionDir = useAssetCache ? getAssetDir(releaseDir, pattern) : releaseDir
  const existingBinary = findBinary(versionDir)
  if (existingBinary && hasRuntime(existingBinary)) {
    log.info(`llama-server binary already exists: ${existingBinary}`)
    binaryPath = existingBinary
    return existingBinary
  }

  const asset = findReleaseAsset(releaseData, variant, assetName)
  if (!asset && !existingBinary) {
    const available = (releaseData.assets as ReleaseAsset[]).map((a) => a.name).join(', ')
    throw new Error(
      `No matching asset found for pattern "${pattern}". Available: ${available}`
    )
  }

  if (!existingBinary) await installReleaseAsset(asset, versionDir, onStatus, signal)

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

  if (!hasRuntime(resultBinary)) {
    const runtime = (releaseData.assets as ReleaseAsset[]).find((a) => a.name === runtimeName)
    if (!runtime) throw new Error(`CUDA runtime asset "${runtimeName}" not found in release ${tag}`)
    await installReleaseAsset(runtime, path.dirname(resultBinary), onStatus, signal)
    if (!hasRuntime(resultBinary)) throw new Error(`CUDA runtime DLLs missing after extracting ${runtimeName}`)
  }

  log.info(`llama-server binary ready: ${resultBinary}`)
  binaryPath = resultBinary
  onStatus?.('Ready')
  return resultBinary
}

export const checkLlamaCppUpdate = async (): Promise<{ currentVersion: string | null; latestVersion: string | null; updateAvailable: boolean }> => {
  const currentInfo = getLlamaCppInfo()

  try {
    const releaseData = await fetchLlamaRelease('latest', AbortSignal.timeout(5000))
    const latestVersion = releaseData.tag_name
    const currentVersion = currentInfo.version
    
    if (!currentVersion) {
      return { currentVersion: null, latestVersion, updateAvailable: true }
    }
    
    return { 
      currentVersion, 
      latestVersion, 
      updateAvailable: /^b\d+$/.test(currentVersion) && /^b\d+$/.test(latestVersion)
        ? Number(currentVersion.slice(1)) < Number(latestVersion.slice(1))
        : currentVersion !== latestVersion
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
  // Resolve the requested update before stopping the running service.
  onStatus?.('Checking for updates…')
  let release: LlamaRelease
  try {
    release = await fetchLlamaRelease()
  } catch (error) {
    throw new Error(
      `Cannot update llama.cpp: unable to reach GitHub. ` +
      `Please check your internet connection. (${error?.message ?? error})`
    )
  }

  const { llamaCpp = {} } = await getConfig()
  const variant = llamaCpp.assetName?.trim() ? '' : resolveVariant(llamaCpp.variant)
  if (!findReleaseAsset(release, variant, llamaCpp.assetName)) {
    throw new Error(`No matching llama.cpp archive found in release ${release.tag_name}`)
  }

  // Stop if running.
  await stopLlamaCpp()
  await setupTask?.catch(() => {})
  
  // Target this release explicitly so setup cannot reuse an older cached version.
  // Keep installed binaries available if downloading the replacement fails.
  onStatus?.('Downloading update…')
  await setupLlamaCpp(onStatus, undefined, release.tag_name)

  const config = await getConfig()
  await setConfig({ llamaCpp: { ...config.llamaCpp, version: 'latest' } })
  
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
  const port = await findAvailablePort(llamaConfig.port || 18881, host, signal)
  const url = `http://${host}:${port}`
  onStatus?.('Starting llama-server…')
  return {
    file: binary,
    args: ['--host', host, '--port', String(port), '--models-dir', getModelsDir(), ...(llamaConfig.extraArgs ?? [])],
    env: getProcessEnv(config.envVars), url,
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
