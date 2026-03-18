// @ts-nocheck

import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

import * as tar from 'tar'
import * as pty from 'node-pty'
import log from 'electron-log'

import {
  getConfig,
  getUserDataPath,
  portInUse,
  downloadFileWithProgress
} from './index'

import { getModelsDir } from './huggingface'

// ─── State ──────────────────────────────────────────────

let ptyProcess: pty.IPty | null = null
let pid: number | null = null
let url: string | null = null
let status: string | null = null // null | setting-up | starting | started | stopped | failed
let logBuffer: string[] = []
let binaryPath: string | null = null

// ─── Public Getters ─────────────────────────────────────

export const getLlamaCppInfo = () => ({
  url,
  status,
  pid,
  binaryPath
})

export const getLlamaCppPty = (): pty.IPty | null => ptyProcess
export const getLlamaCppLog = (): string[] => logBuffer

// ─── Asset Resolution ───────────────────────────────────

interface ReleaseAsset {
  name: string
  browser_download_url: string
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

export const setupLlamaCpp = async (
  onStatus?: (status: string) => void
): Promise<string> => {
  const config = await getConfig()
  const llamaConfig = config.llamaCpp ?? {}
  const version = llamaConfig.version || 'latest'
  const variant = llamaConfig.variant || 'cpu'

  const cacheBase = path.join(getUserDataPath(), 'llama.cpp')
  if (!fs.existsSync(cacheBase)) {
    fs.mkdirSync(cacheBase, { recursive: true })
  }

  onStatus?.('Fetching release info…')
  const apiUrl =
    version === 'latest'
      ? 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest'
      : `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${version}`

  let releaseData: any
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
    }
    releaseData = await response.json()
  } catch (error) {
    throw new Error(`Failed to fetch release info: ${error?.message ?? error}`)
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
    })
  }

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

// ─── Lifecycle ──────────────────────────────────────────

export const startLlamaCpp = async (
  onStatus?: (status: string) => void
): Promise<{ url: string; pid: number }> => {
  await stopLlamaCpp()

  status = 'setting-up'
  onStatus?.('Setting up llama.cpp…')

  const binary = await setupLlamaCpp(onStatus)

  status = 'starting'
  onStatus?.('Starting llama-server…')

  const config = await getConfig()
  const llamaConfig = config.llamaCpp ?? {}
  const host = '127.0.0.1'

  let desiredPort = llamaConfig.port || 8081
  let availablePort = desiredPort
  while (await portInUse(availablePort, host)) {
    availablePort++
    if (availablePort > desiredPort + 100) {
      throw new Error('No available port found for llama-server')
    }
  }

  const extraArgs = llamaConfig.extraArgs ?? []
  const modelsDir = getModelsDir()
  const commandArgs = ['--host', host, '--port', availablePort.toString(), '--models-dir', modelsDir, ...extraArgs]

  log.info('Starting llama-server:', binary, commandArgs.join(' '))

  let spawned: pty.IPty
  try {
    spawned = pty.spawn(binary, commandArgs, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      env: {
        ...process.env,
        ...(config.envVars ?? {})
      }
    })
  } catch (error) {
    status = 'failed'
    throw new Error(`Failed to spawn llama-server: ${error?.message ?? error}`)
  }

  const spawnedPid = spawned.pid
  logBuffer = []
  ptyProcess = spawned
  pid = spawnedPid

  spawned.onData((data: string) => {
    logBuffer.push(data)
    log.info(`[llamacpp:${spawnedPid}] ${data.replace(/[\r\n]+/g, ' ').trim()}`)
  })

  spawned.onExit(({ exitCode, signal }) => {
    log.info(`[llamacpp:${spawnedPid}] Exited code=${exitCode} signal=${signal}`)
    const exitMsg = `\r\n[Process exited with code ${exitCode}${signal ? ` signal ${signal}` : ''}]\r\n`
    logBuffer.push(exitMsg)
    ptyProcess = null
    pid = null
    url = null
    status = 'stopped'
  })

  const serverUrl = `http://${host}:${availablePort}`
  const maxAttempts = 30
  let ready = false

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const resp = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) })
      if (resp.ok) {
        const body = await resp.json()
        if (body.status === 'ok' || body.status === 'no slot available') {
          ready = true
          break
        }
      }
    } catch {
      // Not ready yet
    }
  }

  if (!ready) {
    log.warn('llama-server did not report healthy within 30s, continuing anyway')
  }

  url = serverUrl
  status = 'started'
  log.info(`llama-server started — PID: ${spawnedPid}, URL: ${serverUrl}`)

  return { url: serverUrl, pid: spawnedPid }
}

export const stopLlamaCpp = async (): Promise<void> => {
  if (ptyProcess) {
    try {
      ptyProcess.kill()
    } catch (e) {
      log.warn('Failed to kill llama-server PTY:', e)
    }
    await new Promise((r) => setTimeout(r, 2000))
    if (pid) {
      try {
        process.kill(pid, 0)
        process.kill(pid, 'SIGKILL')
      } catch {
        // already dead
      }
    }
  }
  ptyProcess = null
  pid = null
  url = null
  status = null
  logBuffer = []
}
