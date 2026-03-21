// @ts-nocheck

import crypto from 'crypto'
import log from 'electron-log'
import * as pty from 'node-pty'
import {
  getPythonPath,
  getConfig,
  installPackage,
  isPackageInstalled,
  isPythonInstalled,
  portInUse
} from './index'
import { ServiceLock, isProcessAlive } from './service-lock'

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
  port: number | null = null
): Promise<{ url: string; apiKey: string; pid: number }> => {
  if (!lock.acquire()) {
    return { url, apiKey, pid }
  }

  await stopOpenTerminal()

  if (!isPythonInstalled()) throw new Error('Python is not installed')
  if (!isPackageInstalled('open-terminal')) {
    log.info('open-terminal not installed, installing...')
    const ok = await installPackage('open-terminal')
    if (!ok) throw new Error('Failed to install open-terminal')
  }

  const pythonPath = getPythonPath()
  const host = '127.0.0.1'
  const config = await getConfig()
  const configEnvVars = config.envVars ?? {}

  // Auto-generate API key
  const generatedKey = crypto.randomBytes(24).toString('base64url')

  // Find available port
  let desiredPort = port || 39284
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

  log.info('Starting Open Terminal...', pythonPath, commandArgs.join(' '))

  let spawned: pty.IPty
  try {
    spawned = pty.spawn(pythonPath, commandArgs, {
      name: 'xterm-256color',
      cols: 200,
      rows: 50,
      env: {
        ...process.env,
        ...(configEnvVars ?? {}),
        PYTHONUNBUFFERED: '1',
        ...(process.platform === 'win32' ? { PYTHONIOENCODING: 'utf-8' } : {})
      }
    })
  } catch (error) {
    throw new Error(
      `Failed to spawn Open Terminal: ${error?.message ?? error}`
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
    ptyProcess = null
    pid = null
    url = null
    apiKey = null
    status = 'stopped'
  })

  const serverUrl = `http://${host}:${availablePort}`
  url = serverUrl
  status = 'started'
  log.info(`Open Terminal started — PID: ${spawnedPid}, URL: ${serverUrl}`)

  return { url: serverUrl, apiKey: generatedKey, pid: spawnedPid }
}

export const stopOpenTerminal = async (): Promise<void> => {
  if (ptyProcess) {
    try {
      ptyProcess.kill()
    } catch (e) {
      log.warn('Failed to kill Open Terminal PTY:', e)
    }
    // Give it a moment to exit
    await new Promise((r) => setTimeout(r, 1000))
    // Force kill if still running
    if (pid) {
      try {
        process.kill(pid, 0) // check alive
        process.kill(pid, 'SIGKILL')
      } catch {
        // already dead
      }
    }
  }
  ptyProcess = null
  pid = null
  url = null
  apiKey = null
  status = null
  logBuffer = []
  lock.release()
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
