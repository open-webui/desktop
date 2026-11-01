import { autoUpdater, type UpdateInfo } from 'electron-updater'
import log from 'electron-log'
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { UpdateState } from '../shared/updater'

let state: UpdateState = { status: 'idle' }
let publish: (type: string, data: UpdateState) => void = () => {}

export const getUpdateState = (): UpdateState => state

function setState(next: UpdateState): void {
  state = next
  publish('update:state', state)
}

function unsupportedReason(): UpdateState['reason'] {
  if (!app.isPackaged) return 'development'
  if (process.platform !== 'linux') return undefined
  if (process.env.SNAP || process.env.FLATPAK_ID || existsSync('/.flatpak-info')) return 'managed'
  if (process.env.APPIMAGE) return undefined
  try {
    const type = readFileSync(join(process.resourcesPath, 'package-type'), 'utf8').trim()
    if (['deb', 'rpm', 'pacman'].includes(type)) return undefined
  } catch {}
  return 'unsupported'
}

function failed(error: unknown): void {
  log.warn('Desktop update failed:', error)
  setState({ ...state, status: 'error', error: error instanceof Error ? error.message : String(error) })
}

export function initUpdater(send: typeof publish, automatic: boolean): void {
  publish = send
  autoUpdater.logger = log
  autoUpdater.autoDownload = automatic
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({ status: autoUpdater.autoDownload ? 'downloading' : 'available', version: info.version, percent: 0 })
  })
  autoUpdater.on('update-not-available', () => setState({ status: 'up-to-date' }))
  autoUpdater.on('download-progress', (progress) => {
    setState({ ...state, status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({ status: 'downloaded', version: info.version, percent: 100 })
  })
  autoUpdater.on('error', failed)

  void checkForUpdates()
  const timer = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
  timer.unref()
  app.once('will-quit', () => clearInterval(timer))
}

export function setAutomaticUpdates(enabled: boolean): void {
  const changed = autoUpdater.autoDownload !== enabled
  autoUpdater.autoDownload = enabled
  if (changed && enabled) void checkForUpdates()
}

export async function checkForUpdates(): Promise<void> {
  // Preserve a pending download/install when a timer or another window requests a check.
  if (['checking', 'downloading', 'downloaded'].includes(state.status)) return
  const reason = unsupportedReason()
  if (reason) {
    setState({ status: 'unsupported', reason })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) setState({ status: 'unsupported', reason: 'unsupported' })
    else await result.downloadPromise
  } catch (error) {
    failed(error)
  }
}

export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') return
  setState({ ...state, status: 'downloading', percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    failed(error)
  }
}

export function installUpdate(): void {
  if (state.status === 'downloaded') autoUpdater.quitAndInstall(false, true)
}
