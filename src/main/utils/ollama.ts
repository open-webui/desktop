import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { createZstdDecompress } from 'node:zlib'
import * as tar from 'tar'
import log from 'electron-log'
import { ManagedService, waitForReady } from '../process/managedService'
import type { ServiceInfo } from '../../shared/terminal'
import { spawnPty } from '../process/nativePty'
import {
  downloadFileWithProgress,
  findAvailablePort,
  getConfig,
  getInstallDir,
  getProcessEnv,
  setConfig
} from './index'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  digest?: string
}
interface Release {
  tag_name: string
  assets: ReleaseAsset[]
}
type OllamaInfo = ServiceInfo & { binaryPath: string | null; version: string | null }
type Status = (status: string) => void
const runFile = promisify(execFile)
const validTag = /^v\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.-]+)?$/
const cacheDir = (): string => path.join(getInstallDir(), 'ollama')
const binaryIn = (dir: string): string | null => {
  const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  return (
    [path.join(dir, 'bin', name), path.join(dir, name)].find((file) => fs.existsSync(file)) ?? null
  )
}
const cachedBinary = (tag: string): string | null => {
  const dir = path.join(cacheDir(), tag)
  return fs.existsSync(path.join(dir, '.complete')) ? binaryIn(dir) : null
}
const cachedTags = (): string[] =>
  fs.existsSync(cacheDir())
    ? fs
        .readdirSync(cacheDir())
        .filter((tag) => validTag.test(tag))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : []

export const ollamaService = new ManagedService(spawnPty)
ollamaService.subscribe((event) => {
  if (event.type === 'output') log.info(event.data.trimEnd())
})
let binaryPath: string | null = null
let setupTask: Promise<string> | undefined
let setupAbort: AbortController | undefined
let maintenance = false
let closed = false

export const getOllamaInfo = (): OllamaInfo => {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    binaryPath = cachedTags().map(cachedBinary).find(Boolean) ?? null
  }
  const version = binaryPath ? path.relative(cacheDir(), binaryPath).split(path.sep)[0] : null
  return { ...ollamaService.info, binaryPath, version }
}

const fetchRelease = async (version = 'latest', signal?: AbortSignal): Promise<Release> => {
  if (version !== 'latest' && !validTag.test(version))
    throw new Error('Invalid Ollama version; use latest or v0.0.0')
  const response = await fetch(
    `https://api.github.com/repos/ollama/ollama/releases/${version === 'latest' ? 'latest' : `tags/${version}`}`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)])
    }
  )
  if (!response.ok) throw new Error(`Cannot fetch Ollama release: HTTP ${response.status}`)
  const release = (await response.json()) as Release
  if (!validTag.test(release.tag_name) || !Array.isArray(release.assets))
    throw new Error('Invalid Ollama release metadata')
  return release
}

export const selectOllamaAsset = (
  assets: ReleaseAsset[],
  platform = process.platform,
  arch = process.arch
): ReleaseAsset => {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported Ollama architecture: ${arch}`)
  const cpu = arch === 'x64' ? 'amd64' : 'arm64'
  const names =
    platform === 'darwin'
      ? ['ollama-darwin.tgz']
      : platform === 'win32'
        ? [`ollama-windows-${cpu}.zip`]
        : platform === 'linux'
          ? [`ollama-linux-${cpu}.tar.zst`, `ollama-linux-${cpu}.tgz`]
          : []
  const asset = names.map((name) => assets.find((asset) => asset.name === name)).find(Boolean)
  if (!asset) throw new Error(`No Ollama archive available for ${platform}/${arch}`)
  return asset
}

const prepareOllama = async (
  onStatus: Status | undefined,
  signal: AbortSignal,
  requestedVersion?: string
): Promise<string> => {
  signal.throwIfAborted()
  const config = await getConfig()
  const version = requestedVersion || config.ollama?.version || 'latest'
  if (version !== 'latest' && !validTag.test(version))
    throw new Error('Invalid Ollama version; use latest or v0.0.0')
  const cached = (version === 'latest' ? cachedTags() : [version]).map(cachedBinary).find(Boolean)
  if (cached) {
    binaryPath = cached
    return cached
  }
  onStatus?.('Fetching Ollama release…')
  const release = await fetchRelease(version, signal)
  const asset = selectOllamaAsset(release.assets)
  const existing = cachedBinary(release.tag_name)
  if (existing) {
    binaryPath = existing
    return existing
  }
  let checksum = asset.digest?.replace(/^sha256:/, '') ?? ''
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    const sums = release.assets.find((asset) => asset.name === 'sha256sum.txt')
    if (!sums) throw new Error('Ollama release is missing SHA-256 checksums')
    const response = await fetch(sums.browser_download_url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)])
    })
    if (!response.ok) throw new Error(`Cannot fetch Ollama checksums: HTTP ${response.status}`)
    checksum =
      (await response.text())
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .find(([, name]) => name?.replace(/^\*?(?:\.\/)?/, '') === asset.name)?.[0] ?? ''
  }
  if (!/^[a-f0-9]{64}$/i.test(checksum))
    throw new Error('Ollama archive is missing a valid SHA-256 checksum')
  fs.mkdirSync(cacheDir(), { recursive: true })
  // Only publish a complete extraction, so cancelled installs cannot become cached binaries.
  const staging = fs.mkdtempSync(path.join(cacheDir(), '.install-'))
  try {
    const archive = path.join(staging, asset.name)
    onStatus?.(`Downloading ${asset.name}…`)
    await downloadFileWithProgress(
      asset.browser_download_url,
      archive,
      (percent: number) => {
        onStatus?.(`Downloading Ollama… ${percent.toFixed(0)}%`)
      },
      signal,
      checksum
    )
    signal.throwIfAborted()
    onStatus?.('Extracting Ollama…')
    if (asset.name.endsWith('.zip')) {
      await runFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${staging.replaceAll("'", "''")}' -Force`
        ],
        { signal, windowsHide: true }
      )
    } else if (asset.name.endsWith('.tar.zst')) {
      await pipeline(
        fs.createReadStream(archive),
        createZstdDecompress(),
        tar.x({ cwd: staging, strict: true }),
        { signal }
      )
    } else {
      await pipeline(fs.createReadStream(archive), tar.x({ cwd: staging, strict: true }), {
        signal
      })
    }
    signal.throwIfAborted()
    const binary = binaryIn(staging)
    if (!binary) throw new Error('Ollama binary missing after extraction')
    if (process.platform !== 'win32') fs.chmodSync(binary, 0o755)
    fs.unlinkSync(archive)
    fs.writeFileSync(path.join(staging, '.complete'), '')
    const destination = path.join(cacheDir(), release.tag_name)
    fs.rmSync(destination, { recursive: true, force: true })
    fs.renameSync(staging, destination)
    binaryPath = binaryIn(destination)
    onStatus?.('Ready')
    return binaryPath!
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

const setup = (onStatus?: Status, signal?: AbortSignal, version?: string): Promise<string> => {
  if (!setupTask) {
    setupAbort = new AbortController()
    const combined = AbortSignal.any([setupAbort.signal, ...(signal ? [signal] : [])])
    setupTask = prepareOllama(onStatus, combined, version).finally(() => {
      setupTask = undefined
      setupAbort = undefined
    })
  }
  return setupTask
}
const assertAvailable = (): void => {
  if (closed || maintenance) throw new Error('Ollama is being updated, removed, or shut down')
}
export const setupOllama = (onStatus?: Status): Promise<string> => {
  assertAvailable()
  return setup(onStatus)
}
export const startOllama = (onStatus?: Status): Promise<ServiceInfo> => {
  assertAvailable()
  return ollamaService.start(async (signal) => {
    const binary = await setup(onStatus, signal)
    signal.throwIfAborted()
    const config = await getConfig()
    const port = await findAvailablePort(config.ollama?.port ?? 11434, '127.0.0.1', signal)
    const url = `http://127.0.0.1:${port}`
    onStatus?.('Starting Ollama…')
    return {
      file: binary,
      args: ['serve'],
      url,
      env: { ...getProcessEnv(config.envVars), OLLAMA_HOST: url },
      ready: (signal: AbortSignal) =>
        waitForReady(
          async (probeSignal) => {
            const response = await fetch(`${url}/api/version`, { signal: probeSignal })
            return response.ok && typeof (await response.json()).version === 'string'
          },
          signal,
          90000
        )
    }
  })
}
export const stopOllama = async (): Promise<void> => {
  setupAbort?.abort(new Error('Ollama setup cancelled'))
  await ollamaService.stop()
  await setupTask?.catch(() => {})
}
export const shutdownOllama = async (): Promise<void> => {
  closed = true
  await stopOllama()
  await ollamaService.shutdown()
}
export const checkOllamaUpdate = async (): Promise<{
  currentVersion: string | null
  latestVersion: string
  updateAvailable: boolean
}> => {
  const { version: currentVersion } = getOllamaInfo()
  const release = await fetchRelease()
  selectOllamaAsset(release.assets)
  const latestVersion = release.tag_name
  return {
    currentVersion,
    latestVersion,
    updateAvailable:
      !currentVersion ||
      currentVersion.localeCompare(latestVersion, undefined, { numeric: true }) < 0
  }
}
export const updateOllama = async (onStatus?: Status): Promise<OllamaInfo> => {
  assertAvailable()
  maintenance = true
  try {
    const release = await fetchRelease()
    selectOllamaAsset(release.assets)
    await stopOllama()
    if (closed) throw new Error('Ollama is shutting down')
    await setup(onStatus, undefined, release.tag_name)
    const config = await getConfig()
    await setConfig({ ollama: { ...config.ollama, version: 'latest' } })
    return getOllamaInfo()
  } finally {
    maintenance = false
  }
}
export const uninstallOllama = async (): Promise<void> => {
  assertAvailable()
  maintenance = true
  try {
    await stopOllama()
    fs.rmSync(cacheDir(), { recursive: true, force: true })
    binaryPath = null
  } finally {
    maintenance = false
  }
}
