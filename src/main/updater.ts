import { autoUpdater, type UpdateInfo } from 'electron-updater'
import log from 'electron-log'
import { BrowserWindow } from 'electron'

let mainWin: BrowserWindow | null = null

const send = (type: string, data?: any): void => {
  mainWin?.webContents.send('main:data', { type, data })
}

export function initUpdater(window: BrowserWindow): void {
  mainWin = window

  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    send('update:checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', (_info: UpdateInfo) => {
    send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    send('update:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (_info: UpdateInfo) => {
    send('update:downloaded')
  })

  autoUpdater.on('error', (error: Error) => {
    send('update:error', { message: error?.message ?? 'Update error' })
  })

  // Auto-check on launch (silently)
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('Auto update check failed:', err)
  })
}

export async function checkForUpdates(): Promise<void> {
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
