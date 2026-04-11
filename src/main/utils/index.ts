// @ts-nocheck

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import net from 'net'
import crypto from 'crypto'

import * as tar from 'tar'

import { app, shell, Notification } from 'electron'
import { execFileSync, exec, spawn, execSync, execFile } from 'child_process'

import log from 'electron-log'
log.transports.file.resolvePathFn = () => getLogFilePath('main')

const serverLogger = log.create({ logId: 'server' })
serverLogger.transports.file.resolvePath = () => getLogFilePath('server')

// ─── Paths ──────────────────────────────────────────────

export const getLogFilePath = (name: string = 'main'): string => {
  const logDir = path.join(getUserDataPath(), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return path.join(logDir, `${name}.log`)
}

export const getAppPath = (): string => {
  let appPath = app.getAppPath()
  if (app.isPackaged) {
    appPath = path.dirname(appPath)
  }
  return path.normalize(appPath)
}

export const getUserHomePath = (): string => {
  return path.normalize(app.getPath('home'))
}

export const getUserDataPath = (): string => {
  const userDataDir = app.getPath('userData')
  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true })
    } catch (error) {
      log.error(error)
    }
  }
  return path.normalize(userDataDir)
}

/**
 * Root directory for heavyweight data (Python, models, llama.cpp).
 * Reads `installDir` from config.json synchronously so it's available
 * before any async init. Falls back to `getUserDataPath()`.
 */
export const getInstallDir = (): string => {
  const configPath = path.join(getUserDataPath(), 'config.json')
  let customDir = ''
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      customDir = data.installDir || ''
    }
  } catch {}
  const installDir = customDir || getUserDataPath()
  if (!fs.existsSync(installDir)) {
    try {
      fs.mkdirSync(installDir, { recursive: true })
    } catch (error) {
      log.error(error)
    }
  }
  return path.normalize(installDir)
}

export const getOpenWebUIDataPath = (): string => {
  // Check config for custom data directory
  const configPath = path.join(getUserDataPath(), 'config.json')
  let customDir = ''
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      customDir = data.dataDir || ''
    }
  } catch {}
  const openWebUIDataDir = customDir || path.join(getInstallDir(), 'data')
  if (!fs.existsSync(openWebUIDataDir)) {
    try {
      fs.mkdirSync(openWebUIDataDir, { recursive: true })
    } catch (error) {
      log.error(error)
    }
  }
  return path.normalize(openWebUIDataDir)
}

export const openUrl = (url: string) => {
  if (!url) {
    throw new Error('No URL provided to open in browser.')
  }
  log.info('Opening URL in browser:', url)
  if (url.startsWith('http://0.0.0.0')) {
    url = url.replace('http://0.0.0.0', 'http://localhost')
  }
  shell.openExternal(url)
}

export const getSystemInfo = () => {
  return {
    platform: os.platform(),
    architecture: os.arch()
  }
}

export const getSecretKey = (keyPath?: string, key?: string): string => {
  keyPath = keyPath || path.join(getOpenWebUIDataPath(), '.key')
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8')
  }
  key = key || crypto.randomBytes(64).toString('hex')
  fs.writeFileSync(keyPath, key)
  return key
}

// ─── Port Utils ─────────────────────────────────────────

export const portInUse = async (port: number, host: string = '0.0.0.0'): Promise<boolean> => {
  return new Promise((resolve) => {
    const client = new net.Socket()
    client
      .setTimeout(1000)
      .once('connect', () => {
        client.destroy()
        resolve(true)
      })
      .once('timeout', () => {
        client.destroy()
        resolve(false)
      })
      .once('error', () => {
        resolve(false)
      })
      .connect(port, host)
  })
}

// ─── Python Download & Install ──────────────────────────

const getPlatformString = () => {
  const platformMap = {
    darwin: 'apple-darwin',
    win32: 'pc-windows-msvc',
    linux: 'unknown-linux-gnu'
  }
  return platformMap[os.platform()] || 'unknown-linux-gnu'
}

const getArchString = () => {
  const archMap = {
    x64: 'x86_64',
    arm64: 'aarch64',
    ia32: 'i686'
  }
  return archMap[os.arch()] || 'x86_64'
}

const generateDownloadUrl = () => {
  const baseUrl = 'https://github.com/astral-sh/python-build-standalone/releases/download'
  const releaseDate = '20260310'
  const pythonVersion = '3.12.13'
  const archString = getArchString()
  const platformString = getPlatformString()
  const filename = `cpython-${pythonVersion}+${releaseDate}-${archString}-${platformString}-install_only.tar.gz`
  return `${baseUrl}/${releaseDate}/${filename}`
}

export const downloadFileWithProgress = async (url, downloadPath, onProgress) => {
  try {
    const response = await fetch(url)
    if (!response || !response.ok) {
      throw new Error(`HTTP error! status: ${response?.status}`)
    }
    const totalSize = parseInt(response.headers.get('content-length'), 10)
    let downloadedSize = 0
    const reader = response.body.getReader()
    const chunks = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      downloadedSize += value.length
      if (onProgress && totalSize) {
        onProgress((downloadedSize / totalSize) * 100, downloadedSize, totalSize)
      }
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    fs.writeFileSync(downloadPath, buffer)
    log.info('File downloaded successfully:', downloadPath)
    return downloadPath
  } catch (error) {
    // Clean up partial downloads
    try {
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath)
      }
    } catch {}
    log.error('Download failed:', error)
    throw error
  }
}

export const getPythonDownloadPath = (): string => {
  return path.join(getUserDataPath(), 'python.tar.gz')
}

export const getPythonInstallationDir = (): string => {
  const pythonDir = path.join(getInstallDir(), 'python')
  if (!fs.existsSync(pythonDir)) {
    try {
      fs.mkdirSync(pythonDir, { recursive: true })
    } catch (error) {
      log.error(error)
    }
  }
  return path.normalize(pythonDir)
}

const downloadPython = async (onProgress = null) => {
  const url = generateDownloadUrl()
  const downloadPath = getPythonDownloadPath()

  log.info(`Detected system: ${os.platform()} ${os.arch()}`)
  log.info(`Download path: ${downloadPath}`)
  log.info(`URL: ${url}`)

  if (fs.existsSync(downloadPath)) {
    log.info(`File already exists: ${downloadPath}`)
    return downloadPath
  }

  try {
    const result = await downloadFileWithProgress(url, downloadPath, onProgress)
    log.info(`Python downloaded successfully to: ${result}`)
    return result
  } catch (error) {
    log.error(`Download failed: ${error?.message}`)
    throw error
  }
}

const checkInternet = async () => {
  try {
    await fetch('https://api.openwebui.com', { method: 'GET' })
    return true
  } catch {
    return false
  }
}

export const installPython = async (installationDir?: string, onStatus?: (status: string) => void): Promise<boolean> => {
  const pythonDownloadPath = getPythonDownloadPath()
  if (!fs.existsSync(pythonDownloadPath)) {
    if (!(await checkInternet())) {
      throw new Error(
        'An active internet connection is required. Please connect to the internet and try again.'
      )
    }
    let lastReportedPct = -1
    await downloadPython((progress, downloaded, total) => {
      const pct = Math.floor(progress)
      if (pct === lastReportedPct) return
      lastReportedPct = pct
      const mb = (downloaded / 1024 / 1024).toFixed(1)
      const totalMb = (total / 1024 / 1024).toFixed(1)
      log.info(`Downloading Python: ${pct}% (${mb}/${totalMb} MB)`)
      onStatus?.(`Downloading Python… ${pct}% (${mb}/${totalMb} MB)`)
    })
  }
  if (!fs.existsSync(pythonDownloadPath)) {
    log.error('Python download not found')
    return false
  }

  installationDir = installationDir || getPythonInstallationDir()
  log.info(installationDir, pythonDownloadPath)

  try {
    onStatus?.('Extracting Python…')
    const installBase = getInstallDir()
    await tar.x({ cwd: installBase, file: pythonDownloadPath })
  } catch (error) {
    log.error(error)
    // Remove possibly-corrupted download so next retry re-downloads
    try { fs.unlinkSync(pythonDownloadPath) } catch {}
    throw new Error(
      'Failed to extract Python. The download may be corrupted. Please try again.'
    )
  }

  if (!isPythonInstalled(installationDir)) {
    log.error('Python installation failed or not found')
    throw new Error(
      'Python was not found after installation. Try restarting the app or freeing disk space.'
    )
  }

  try {
    onStatus?.('Installing uv package manager…')
    const pythonPath = getPythonPath(installationDir)
    await new Promise<void>((resolve, reject) => {
      execFile(
        pythonPath,
        ['-m', 'pip', 'install', 'uv'],
        {
          encoding: 'utf-8',
          env: {
            ...process.env,
            ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
          }
        },
        (error) => {
          if (error) reject(error)
          else resolve()
        }
      )
    })
    log.info('Successfully installed uv package')
    return true
  } catch (error) {
    log.error('Failed to install uv:', error)
    throw new Error(
      `Failed to install the uv package manager: ${error?.message || 'unknown error'}`
    )
  }
}

export const getPythonExecutablePath = (envPath: string) => {
  if (process.platform === 'win32') {
    return path.normalize(path.join(envPath, 'python.exe'))
  }
  return path.normalize(path.join(envPath, 'bin', 'python'))
}

export const getPythonPath = (installationDir?: string) => {
  return path.normalize(getPythonExecutablePath(installationDir || getPythonInstallationDir()))
}

export const isPythonInstalled = (installationDir?: string) => {
  const pythonPath = getPythonPath(installationDir)
  if (!fs.existsSync(pythonPath)) {
    return false
  }
  try {
    const pythonVersion = execFileSync(pythonPath, ['--version'], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
    log.info('Installed Python Version:', pythonVersion.trim())
    return true
  } catch {
    return false
  }
}

export const isUvInstalled = (installationDir?: string) => {
  const pythonPath = getPythonPath(installationDir)
  try {
    const result = execFileSync(pythonPath, ['-m', 'uv', '--version'], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
    log.info('Installed uv Version:', result.trim())
    return true
  } catch {
    return false
  }
}

export const uninstallPython = (installationDir?: string): boolean => {
  installationDir = installationDir || getPythonInstallationDir()
  if (!fs.existsSync(installationDir)) {
    log.error('Python installation not found')
    return false
  }
  try {
    fs.rmSync(installationDir, { recursive: true, force: true })
    log.info('Python installation removed:', installationDir)
  } catch (error) {
    log.error('Failed to remove Python installation', error)
    return false
  }
  try {
    const pythonDownloadPath = getPythonDownloadPath()
    fs.rmSync(pythonDownloadPath, { recursive: true })
  } catch (error) {
    log.error('Failed to remove Python download', error)
    return false
  }
  return true
}

// ─── Package Management ─────────────────────────────────

export const installPackage = (packageName: string, version?: string, onStatus?: (status: string) => void): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!isPythonInstalled()) {
      return reject(new Error('Python is not installed. Please reinstall the app or run setup again.'))
    }
    const pythonPath = getPythonPath()
    const commandProcess = execFile(
      pythonPath,
      [
        '-m',
        'uv',
        'pip',
        'install',
        ...(version ? [`${packageName}==${version}`] : [packageName, '-U'])
      ],
      {
        env: {
          ...process.env,
          ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
        }
      }
    )

    let lastLine = ''
    commandProcess.stdout?.on('data', (data) => {
      const line = data.toString().trim()
      log.info(line)
      if (line) {
        lastLine = line
        onStatus?.(line)
      }
    })
    commandProcess.stderr?.on('data', (data) => {
      const line = data.toString().trim()
      log.info(line)
      if (line) {
        lastLine = line
        onStatus?.(line)
      }
    })
    commandProcess.on('exit', (code) => {
      log.info(`Package install exited with code ${code}`)
      if (code === 0) {
        resolve(true)
      } else {
        reject(new Error(
          lastLine || `Package installation failed (exit code ${code}). Please check your internet connection and try again.`
        ))
      }
    })
    commandProcess.on('error', (error) => {
      log.error(`Package install error: ${error.message}`)
      reject(new Error(`Failed to run package installer: ${error.message}`))
    })
  })
}

export const installPackages = async (
  packages: string[],
  version?: string
): Promise<boolean> => {
  for (const pkg of packages) {
    const ok = await installPackage(pkg, version)
    if (!ok) return false
  }
  return true
}

export const isPackageInstalled = (packageName: string): boolean => {
  const pythonPath = getPythonPath()
  if (!fs.existsSync(pythonPath)) return false
  try {
    const info = execFileSync(pythonPath, ['-m', 'uv', 'pip', 'show', packageName], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
    return info.includes(`Name: ${packageName}`)
  } catch {
    return false
  }
}

export const getPackageVersion = (packageName: string): string | null => {
  const pythonPath = getPythonPath()
  if (!fs.existsSync(pythonPath)) return null
  try {
    const info = execFileSync(pythonPath, ['-m', 'uv', 'pip', 'show', packageName], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
    const match = info.match(/^Version:\s*(.+)$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export const uninstallPackage = (packageName: string): boolean => {
  const pythonPath = getPythonPath()
  if (!fs.existsSync(pythonPath)) return false
  try {
    execFileSync(pythonPath, ['-m', 'uv', 'pip', 'uninstall', packageName], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
    log.info(`Uninstalled package: ${packageName}`)
    return true
  } catch (error) {
    log.error(`Failed to uninstall ${packageName}:`, error)
    return false
  }
}

// ─── Server Management ──────────────────────────────────

import * as pty from 'node-pty'

const serverPIDs: Set<number> = new Set()
const serverLogs: Map<number, string[]> = new Map()
let serverPtyProcesses: Map<number, pty.IPty> = new Map()

export const getServerPIDs = (): number[] => Array.from(serverPIDs)
export const getServerPty = (pid: number): pty.IPty | undefined => serverPtyProcesses.get(pid)

export const startServer = async (
  expose = false,
  port = null
): Promise<{ url: string; pid: number }> => {
  await stopAllServers()
  const config = await getConfig()
  const configEnvVars = config.envVars ?? {}
  const host = expose ? '0.0.0.0' : '127.0.0.1'
  if (!isPythonInstalled()) throw new Error('Python is not installed')
  if (!isPackageInstalled('open-webui')) throw new Error('open-webui package is not installed')

  const pythonPath = getPythonPath()
  log.info(`Using Python at: ${pythonPath}`)

  if (!fs.existsSync(pythonPath)) {
    throw new Error(`Python executable not found at: ${pythonPath}`)
  }

  const commandArgs = ['-m', 'uv', 'run', 'open-webui', 'serve', '--host', host]
  const dataDir = getOpenWebUIDataPath()
  const secretKey = getSecretKey()
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Find available port
  let desiredPort = port || 8080
  let availablePort = desiredPort
  while (await portInUse(availablePort, host)) {
    availablePort++
    if (availablePort > desiredPort + 100) {
      throw new Error('No available ports found')
    }
  }
  commandArgs.push('--port', availablePort.toString())
  log.info('Starting Open-WebUI server...', pythonPath, commandArgs.join(' '))

  let ptyProcess: pty.IPty
  try {
    ptyProcess = pty.spawn(pythonPath, commandArgs, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      env: {
        ...process.env,
        ...(configEnvVars ?? {}),
        DATA_DIR: dataDir,
        WEBUI_SECRET_KEY: secretKey,
        PYTHONUNBUFFERED: '1',
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
  } catch (error) {
    throw new Error(
      `Failed to spawn PTY with ${pythonPath}: ${error?.message ?? error}`
    )
  }

  const pid = ptyProcess.pid
  const rawBuffer: string[] = []
  serverPIDs.add(pid)
  serverLogs.set(pid, rawBuffer)
  serverPtyProcesses.set(pid, ptyProcess)

  ptyProcess.onData((data: string) => {
    rawBuffer.push(data)
    serverLogger.info(`[PID:${pid}] ${data.replace(/[\r\n]+/g, ' ').trim()}`)
  })

  ptyProcess.onExit(({ exitCode, signal }) => {
    const exitMsg = `\r\n[Process exited with code ${exitCode}${signal ? ` signal ${signal}` : ''}]\r\n`
    rawBuffer.push(exitMsg)
    serverLogger.info(`[PID:${pid}] Exited code=${exitCode} signal=${signal}`)
    serverPIDs.delete(pid)
    serverPtyProcesses.delete(pid)
  })

  let effectiveHost = host
  if (!expose && host === '0.0.0.0') effectiveHost = '127.0.0.1'
  const url = `http://${effectiveHost}:${availablePort}`
  log.info(`Server started with PID: ${pid}, URL: ${url}`)

  return { url, pid }
}


export async function stopAllServers(): Promise<void> {
  log.info('Stopping all servers...')
  const pidsToStop = Array.from(serverPIDs)
  if (pidsToStop.length === 0) return

  // Kill PTY processes directly — cleaner than process tree termination
  for (const pid of pidsToStop) {
    const ptyProc = serverPtyProcesses.get(pid)
    if (ptyProc) {
      try {
        ptyProc.kill()
      } catch (e) {
        log.warn(`Failed to kill PTY process ${pid}:`, e)
      }
    } else {
      // Fallback for any non-PTY processes
      await terminateProcessTree(pid, false)
    }
  }

  await sleep(2000)

  // Force kill anything still running
  for (const pid of pidsToStop) {
    if (isProcessRunning(pid)) {
      await terminateProcessTree(pid, true)
    }
  }

  for (const pid of pidsToStop) {
    if (!isProcessRunning(pid)) {
      serverPIDs.delete(pid)
      serverLogs.delete(pid)
      serverPtyProcesses.delete(pid)
    } else {
      log.warn(`Process ${pid} may still be running after termination attempts`)
    }
  }
}

export const clearServerLog = (pid: number): void => {
  const logs = serverLogs.get(pid)
  if (logs) logs.length = 0
}

export const clearAllServerLogs = (): void => {
  for (const logs of serverLogs.values()) {
    logs.length = 0
  }
}

async function terminateProcessTree(pid: number, forceKill: boolean = false): Promise<void> {
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (process.platform === 'win32') {
        await terminateWindows(pid, forceKill)
      } else {
        await terminateUnix(pid, forceKill)
      }
      if (!isProcessRunning(pid)) {
        log.info(`Successfully terminated process tree (PID: ${pid})`)
        return
      }
    } catch (error) {
      log.warn(`Attempt ${attempt}/${maxRetries} failed for PID ${pid}:`, error)
    }
    if (attempt < maxRetries) await sleep(1000)
  }
  log.error(`Failed to terminate process tree (PID: ${pid}) after ${maxRetries} attempts`)
}

async function terminateWindows(pid: number, forceKill: boolean): Promise<void> {
  const commands = forceKill
    ? [`taskkill /PID ${pid} /T /F`]
    : [`taskkill /PID ${pid} /T`, `taskkill /PID ${pid} /T /F`]
  for (const cmd of commands) {
    try {
      execSync(cmd, { timeout: 5000, stdio: 'ignore' })
      await sleep(500)
    } catch {}
  }
}

async function terminateUnix(pid: number, forceKill: boolean): Promise<void> {
  const signals = forceKill ? ['SIGKILL'] : ['SIGTERM', 'SIGKILL']
  for (const signal of signals) {
    try {
      process.kill(-pid, signal)
      await sleep(500)
      if (isProcessRunning(pid)) {
        process.kill(pid, signal)
        await sleep(500)
      }
    } catch {}
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getServerLog(pid: number): string[] {
  return serverLogs.get(pid) || []
}

// ─── URL Validation ─────────────────────────────────────

export const checkUrlAndOpen = async (url: string, callback: Function = async () => {}) => {
  const maxAttempts = 1800
  const interval = 2000
  let attempts = 0

  const checkUrl = async (): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: 'HEAD' })
      return response.ok
    } catch {
      return false
    }
  }

  const pollUrl = async () => {
    while (attempts < maxAttempts) {
      attempts++
      const isAvailable = await checkUrl()
      if (isAvailable) {
        log.info('URL is now available')
        await callback()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
    log.info('URL check timed out')
  }

  pollUrl().catch((error) => {
    log.error('Error in URL polling:', error)
  })
}

export const validateRemoteUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    return response.ok
  } catch {
    return false
  }
}

// ─── Config ─────────────────────────────────────────────

export interface Connection {
  id: string
  name: string
  type: 'local' | 'remote'
  url: string
}

export interface AppConfig {
  version: number
  defaultConnectionId: string | null
  connections: Connection[]
  runInBackground: boolean
  globalShortcut: string
  spotlightShortcut: string
  installDir: string
  dataDir: string
  localServer: {
    port: number
    serveOnLocalNetwork: boolean
    autoUpdate: boolean
  }
  openTerminal: {
    enabled: boolean
    port: number
    cwd: string
  }
  llamaCpp: {
    enabled: boolean
    port: number
    version: string
    variant: string
    extraArgs: string[]
  }
  envVars: Record<string, string>
  showSidebar: boolean
  spotlightPosition: { x: number; y: number } | null
  voiceInputShortcut: string
  voiceInputEnabled: boolean
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  defaultConnectionId: null,
  connections: [],
  runInBackground: true,
  globalShortcut: 'Alt+CommandOrControl+O',
  spotlightShortcut: 'Shift+CommandOrControl+I',
  installDir: '',
  dataDir: '',
  localServer: {
    port: 8080,
    serveOnLocalNetwork: false,
    autoUpdate: true
  },
  openTerminal: {
    enabled: false,
    cwd: ''
  },
  llamaCpp: {
    enabled: false,
    version: 'latest',
    variant: 'cpu',
    extraArgs: []
  },
  envVars: {},
  showSidebar: false,
  spotlightPosition: null,
  voiceInputShortcut: 'Shift+CommandOrControl+Space',
  voiceInputEnabled: true
}

export const getConfig = async (): Promise<AppConfig> => {
  const configPath = path.join(getUserDataPath(), 'config.json')
  try {
    if (fs.existsSync(configPath)) {
      const data = await fs.promises.readFile(configPath, 'utf8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    }
    return { ...DEFAULT_CONFIG }
  } catch (error) {
    log.error('Error reading config, using defaults:', error)
    return { ...DEFAULT_CONFIG }
  }
}

let configWriteLock: Promise<void> = Promise.resolve()

export const setConfig = async (config: Partial<AppConfig>): Promise<void> => {
  // Serialize writes so concurrent callers don't race on the tmp file
  const previous = configWriteLock
  let resolve: () => void
  configWriteLock = new Promise<void>((r) => { resolve = r })
  await previous

  const configPath = path.join(getUserDataPath(), 'config.json')
  const tmpPath = configPath + '.tmp'
  try {
    const existing = await getConfig()
    const merged = { ...existing, ...config }
    await fs.promises.writeFile(tmpPath, JSON.stringify(merged, null, 2))
    await fs.promises.rename(tmpPath, configPath)
  } catch (error) {
    log.error('Error writing config:', error)
    // Clean up temp file
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {}
    throw error
  } finally {
    resolve!()
  }
}

export const resetApp = async (): Promise<void> => {
  await uninstallPython()
  log.info('Uninstalled Python environment')

  const configPath = path.join(getUserDataPath(), 'config.json')
  if (fs.existsSync(configPath)) {
    try {
      fs.unlinkSync(configPath)
    } catch (error) {
      log.error('Failed to remove config file:', error)
    }
  }

  const secretKeyPath = path.join(getOpenWebUIDataPath(), '.key')
  if (fs.existsSync(secretKeyPath)) {
    try {
      fs.unlinkSync(secretKeyPath)
    } catch (error) {
      log.error('Failed to remove secret key file:', error)
    }
  }

  const dataPath = getOpenWebUIDataPath()
  if (fs.existsSync(dataPath)) {
    try {
      fs.rmSync(dataPath, { recursive: true, force: true })
    } catch (error) {
      log.error('Failed to remove data directory:', error)
    }
  }

  // Remove llama.cpp binaries
  const llamaCppPath = path.join(getInstallDir(), 'llama.cpp')
  if (fs.existsSync(llamaCppPath)) {
    try {
      fs.rmSync(llamaCppPath, { recursive: true, force: true })
      log.info('Removed llama.cpp directory')
    } catch (error) {
      log.error('Failed to remove llama.cpp directory:', error)
    }
  }

  // Remove downloaded models (huggingface + any user-added models)
  const modelsPath = path.join(getInstallDir(), 'models')
  if (fs.existsSync(modelsPath)) {
    try {
      fs.rmSync(modelsPath, { recursive: true, force: true })
      log.info('Removed models directory')
    } catch (error) {
      log.error('Failed to remove models directory:', error)
    }
  }

  // Remove service lock files
  const locksPath = path.join(getUserDataPath(), 'locks')
  if (fs.existsSync(locksPath)) {
    try {
      fs.rmSync(locksPath, { recursive: true, force: true })
      log.info('Removed service locks')
    } catch (error) {
      log.error('Failed to remove locks directory:', error)
    }
  }

  // Clear Electron session data (localStorage, cookies, cache, etc.)
  try {
    const { session } = require('electron')
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearCache()
    log.info('Cleared Electron session data')
  } catch (error) {
    log.error('Failed to clear Electron session data:', error)
  }
}
