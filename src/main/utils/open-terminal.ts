
import crypto from 'crypto'
import log from 'electron-log'
import * as pty from 'node-pty'
import {
  getPythonPath,
  getConfig,
  setConfig,
  installPackage,
  isPackageInstalled,
  isPythonInstalled,
  installPython,
  portInUse,
  pythonEnv
} from './index'
import { ServiceLock, isProcessAlive } from './service-lock'
import { errorMessage } from './error-message'

// ─── State ──────────────────────────────────────────────

let ptyProcess: pty.IPty | null = null
let pid: number | null = null
let url: string | null = null
let apiKey: string | null = null
let status: string | null = null // null | starting | started | stopped | failed
let logBuffer: string[] = []

const lock = new ServiceLock('open-terminal')

// ─── Public API ─────────────────────────────────────────

export const getOpenTerminalInfo = () => ({
  url,
  apiKey,
  status,
  pid
})

export const getOpenTerminalPty = (): pty.IPty | null => ptyProcess
export const getOpenTerminalLog = (): string[] => logBuffer

export const startOpenTerminal = async (
  port: number | null = null,
  onStatus?: (status: string) => void
): Promise<{ url: string; apiKey: string; pid: number }> => {
  if (!lock.acquire()) {
    if (url == null || apiKey == null || pid == null) {
      throw new Error('Open Terminal start is already in progress')
    }
    return { url, apiKey, pid }
  }

  try {
    await stopOpenTerminal({ retainLock: true })

  if (!isPythonInstalled()) {
    log.info('Python not installed — installing automatically for Open Terminal…')
    onStatus?.('Installing Python…')
    try {
      const ok = await installPython(undefined, onStatus)
      if (!ok) throw new Error('Python installation returned false')
    } catch (err) {
      throw new Error(
        `Python is required for Open Terminal but installation failed: ${errorMessage(err)}`
      )
    }
    if (!isPythonInstalled()) {
      throw new Error(
        'Python was installed but could not be verified. Please restart the app and try again.'
      )
    }
  }

  if (!isPackageInstalled('open-terminal')) {
    log.info('open-terminal not installed, attempting install...')
    onStatus?.('Installing Open Terminal package…')
    try {
      await installPackage('open-terminal')
    } catch (err) {
      throw new Error(
        `Open Terminal is not installed and auto-install failed. ` +
        `Please connect to the internet and try again. (${errorMessage(err)})`
      )
    }
  }

  const pythonPath = getPythonPath()
  const host = '127.0.0.1'
  const config = await getConfig()
  const configEnvVars = config.envVars ?? {}

  // Use persisted API key or generate and save a new one
  let generatedKey = config.openTerminal?.apiKey
  if (!generatedKey) {
    generatedKey = crypto.randomBytes(24).toString('base64url')
    await setConfig({
      openTerminal: { ...config.openTerminal, apiKey: generatedKey }
    })
  }

  // Find available port
  const desiredPort = port || 39284
  let availablePort = desiredPort
  while (await portInUse(availablePort, host)) {
    availablePort++
    if (availablePort > desiredPort + 100) {
      throw new Error('No available port found for Open Terminal')
    }
  }

  const cwd = config.openTerminal?.cwd || require('os').homedir()

  const commandArgs = [
    '-m', 'uv', 'run', 'open-terminal', 'run',
    '--host', host,
    '--port', availablePort.toString(),
    '--api-key', generatedKey,
    '--cwd', cwd
  ]

  log.info(
    `Starting Open Terminal... ${pythonPath} -m uv run open-terminal run --host ${host} --port ${availablePort}`
  )

  let spawned: pty.IPty
  try {
    spawned = pty.spawn(pythonPath, commandArgs, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      env: pythonEnv({
        ...(configEnvVars ?? {}),
        PYTHONUNBUFFERED: '1'
      })
    })
  } catch (error) {
    throw new Error(
      `Failed to spawn Open Terminal: ${errorMessage(error)}`
    )
  }

  const spawnedPid = spawned.pid
  logBuffer = []
  ptyProcess = spawned
  pid = spawnedPid
  apiKey = generatedKey
  status = 'starting'

  spawned.onData((data: string) => {
    logBuffer.push(data)
    log.info(`[OpenTerminal:${spawnedPid}] ${data.replace(/[\r\n]+/g, ' ').trim()}`)
  })

  spawned.onExit(({ exitCode, signal }) => {
    log.info(`[OpenTerminal:${spawnedPid}] Exited code=${exitCode} signal=${signal}`)
    if (ptyProcess === spawned) {
      ptyProcess = null
      pid = null
      url = null
      apiKey = null
      status = 'stopped'
      lock.release()
    }
  })

  const serverUrl = `http://${host}:${availablePort}`
  url = serverUrl
  status = 'started'
  log.info(`Open Terminal started — PID: ${spawnedPid}, URL: ${serverUrl}`)

    return { url: serverUrl, apiKey: generatedKey, pid: spawnedPid }
  } catch (error) {
    lock.release()
    throw error
  }
}

export const stopOpenTerminal = async (opts?: { retainLock?: boolean }): Promise<void> => {
  const proc = ptyProcess
  const procPid = pid
  ptyProcess = null
  pid = null
  url = null
  apiKey = null
  status = null
  logBuffer = []
  if (proc) {
    try {
      proc.kill()
    } catch (e) {
      log.warn('Failed to kill Open Terminal PTY:', e)
    }
    await new Promise((r) => setTimeout(r, 1000))
    if (procPid) {
      try {
        process.kill(procPid, 0)
        process.kill(procPid, 'SIGKILL')
      } catch {
        // already dead
      }
    }
  }
  if (!opts?.retainLock) lock.release()
}

/**
 * Validate whether the tracked Open Terminal process is still alive.
 */
export const validateOpenTerminalProcess = (): boolean => {
  if (!pid) return false
  if (isProcessAlive(pid)) return true
  pid = null
  status = null
  lock.release()
  return false
}
