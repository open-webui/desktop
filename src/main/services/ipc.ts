import { randomBytes } from 'crypto'
import { readFile, stat, writeFile } from 'fs/promises'

import { dialog, ipcMain } from 'electron'

import {
  type ManagedServiceDefinition,
  type ManagedServiceImportPreview,
  type ManagedServicesRequest
} from '../../shared/services/types'
import { ManagedServicesManager } from './manager'
import type { ExportedRegistry } from './registry'

interface PendingImport {
  registry: ExportedRegistry
  expiresAt: number
}

const IMPORT_MAX_BYTES = 1024 * 1024
const IMPORT_TTL_MS = 10 * 60 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const validateRequest = (value: unknown): ManagedServicesRequest => {
  if (!isRecord(value) || typeof value.action !== 'string') {
    throw new Error('Invalid managed-services request')
  }
  return value as unknown as ManagedServicesRequest
}

const requireId = (request: { id?: unknown }): string => {
  if (typeof request.id !== 'string') throw new Error('A service id is required')
  return request.id
}

const requireToken = (request: { token?: unknown }): string => {
  if (typeof request.token !== 'string' || !/^[a-f0-9]{32}$/.test(request.token)) {
    throw new Error('Invalid import confirmation token')
  }
  return request.token
}

export const registerManagedServicesIpc = (
  manager: ManagedServicesManager,
  ready: Promise<void>
): void => {
  const pendingImports = new Map<string, PendingImport>()

  ipcMain.removeHandler('managed-services:request')
  ipcMain.handle('managed-services:request', async (_event, rawRequest: unknown) => {
    await ready
    const request = validateRequest(rawRequest)
    switch (request.action) {
      case 'list':
        return manager.list()
      case 'get':
        return manager.getDefinition(requireId(request))
      case 'preview':
        return manager.registry.preview(request.service)
      case 'upsert':
        return manager.upsert(request.service)
      case 'remove':
        return manager.remove(requireId(request))
      case 'start':
        return manager.start(requireId(request))
      case 'stop':
        return manager.stop(requireId(request))
      case 'logs':
        return manager.getLogs(requireId(request))
      case 'integration':
        return manager.getIntegration(requireId(request))
      case 'suggest-port':
        return manager.suggestPort()
      case 'export': {
        const result = await dialog.showSaveDialog({
          title: 'Export managed services',
          defaultPath: 'managed-services.json',
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) return { canceled: true }
        await writeFile(
          result.filePath,
          JSON.stringify(manager.registry.exportSanitized(), null, 2),
          'utf8'
        )
        return { canceled: false, filePath: result.filePath }
      }
      case 'import-preview': {
        const result = await dialog.showOpenDialog({
          title: 'Import managed services',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePaths[0]) return null
        const filePath = result.filePaths[0]
        const fileInfo = await stat(filePath)
        if (!fileInfo.isFile() || fileInfo.size > IMPORT_MAX_BYTES) {
          throw new Error('Registry import must be a JSON file smaller than 1 MB')
        }
        const parsed = manager.registry.parseImport(JSON.parse(await readFile(filePath, 'utf8')))
        const token = randomBytes(16).toString('hex')
        pendingImports.set(token, { registry: parsed, expiresAt: Date.now() + IMPORT_TTL_MS })

        const preview: ManagedServiceImportPreview = {
          token,
          schemaVersion: parsed.schemaVersion,
          services: parsed.services.map((service: ManagedServiceDefinition) => ({
            id: service.id,
            name: service.name,
            type: service.type,
            commandPreview: manager.registry.commandPreview(service)
          })),
          warnings: [
            'Environment variable values are not imported and must be entered again.',
            'New bearer keys are generated for every imported mcpo service.'
          ]
        }
        return preview
      }
      case 'import-confirm': {
        const token = requireToken(request)
        const pending = pendingImports.get(token)
        pendingImports.delete(token)
        if (!pending || pending.expiresAt < Date.now()) {
          throw new Error('The import preview expired; select the file again')
        }
        await manager.replaceAll(pending.registry.services)
        return manager.list()
      }
      case 'import-cancel':
        pendingImports.delete(requireToken(request))
        return true
      default:
        throw new Error('Unsupported managed-services action')
    }
  })
}
