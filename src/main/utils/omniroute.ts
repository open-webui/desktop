import { spawn, type ChildProcess } from 'child_process'
import { constants } from 'fs'
import { access } from 'fs/promises'
import http from 'http'
import net from 'net'
import { join } from 'path'

import log from 'electron-log'

const OMNIROUTE_HOST = '127.0.0.1'
const OMNIROUTE_PORT = 20128
const CONNECT_TIMEOUT_MS = 500
const HTTP_READINESS_REQUEST_TIMEOUT_MS = 2_000
const READINESS_TIMEOUT_MS = 120_000
const READINESS_POLL_INTERVAL_MS = 250

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const getOmniRoutePaths = (): { nodePath: string; entryPointPath: string } => {
  const programFilesPath = process.env.ProgramFiles
  const appDataPath = process.env.APPDATA

  if (!programFilesPath || !appDataPath) {
    throw new Error('Required Windows environment paths are unavailable')
  }

  return {
    nodePath: join(programFilesPath, 'nodejs', 'node.exe'),
    entryPointPath: join(appDataPath, 'npm', 'node_modules', 'omniroute', 'bin', 'omniroute.mjs')
  }
}

export const isOmniRouteRunning = (timeoutMs = CONNECT_TIMEOUT_MS): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: OMNIROUTE_HOST, port: OMNIROUTE_PORT })
    let settled = false

    const finish = (isRunning: boolean): void => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(isRunning)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

const isOmniRouteReady = (timeoutMs = HTTP_READINESS_REQUEST_TIMEOUT_MS): Promise<boolean> => {
  return new Promise((resolve) => {
    let settled = false

    const request = http.get(
      {
        host: OMNIROUTE_HOST,
        port: OMNIROUTE_PORT,
        path: '/v1/models',
        headers: { accept: 'application/json' }
      },
      (response) => {
        response.resume()
        finish(response.statusCode !== undefined && response.statusCode < 500)
      }
    )

    const finish = (isReady: boolean): void => {
      if (settled) return
      settled = true
      request.removeAllListeners()
      request.destroy()
      resolve(isReady)
    }

    request.setTimeout(timeoutMs)
    request.once('error', () => finish(false))
    request.once('timeout', () => finish(false))
  })
}

export const startOmniRoute = async (): Promise<ChildProcess> => {
  const { nodePath, entryPointPath } = getOmniRoutePaths()

  await Promise.all([access(nodePath, constants.F_OK), access(entryPointPath, constants.F_OK)])

  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [entryPointPath, 'serve', '--no-open', '--tray'], {
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.removeListener('error', reject)
      child.on('error', (error) => log.error('OmniRoute process error:', error))
      child.unref()
      resolve(child)
    })
  })
}

const waitForOmniRoute = async (child: ChildProcess): Promise<boolean> => {
  const deadline = Date.now() + READINESS_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (await isOmniRouteReady()) return true

    if (child.exitCode !== null || child.signalCode !== null) {
      const exitReason =
        child.exitCode !== null ? `exit code ${child.exitCode}` : `signal ${child.signalCode}`
      throw new Error(`OmniRoute exited before becoming ready (${exitReason})`)
    }

    await delay(READINESS_POLL_INTERVAL_MS)
  }

  return isOmniRouteReady()
}

export const ensureOmniRouteRunning = async (): Promise<void> => {
  if (process.platform !== 'win32') return

  try {
    if (await isOmniRouteRunning()) {
      log.info(`OmniRoute already running or starting on port ${OMNIROUTE_PORT}`)
      return
    }

    log.info('Starting OmniRoute...')
    const child = await startOmniRoute()

    if (await waitForOmniRoute(child)) {
      log.info('OmniRoute is ready')
    } else {
      log.error(
        `Failed to start OmniRoute: not reachable on ${OMNIROUTE_HOST}:${OMNIROUTE_PORT} ` +
          `after ${READINESS_TIMEOUT_MS} ms`
      )
    }
  } catch (error) {
    log.error('Failed to start OmniRoute:', error)
  }
}
