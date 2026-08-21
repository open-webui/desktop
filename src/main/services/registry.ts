import { randomBytes } from 'crypto'
import { readFile, rename, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

import { safeStorage } from 'electron'
import log from 'electron-log'

import {
  MANAGED_SERVICES_SCHEMA_VERSION,
  type ManagedServiceDefinition
} from '../../shared/services/types'
import { getConfig, getUserDataPath, setConfig, type AppConfig } from '../utils'
import {
  createDefaultServices,
  materializeMcpoService,
  readLegacyAutostartEnabled
} from './defaults'
import { assertLocalHealthCheckUrl, getPortFromService } from './network'

interface SecretPayload {
  apiKey?: string
  env: Record<string, string>
}

type PersistedService = Omit<ManagedServiceDefinition, 'env'> & { envKeys?: string[] }

interface PersistedRegistry {
  schemaVersion: number
  services: PersistedService[]
  encryptedSecrets?: Record<string, string>
}

export interface ExportedRegistry {
  schemaVersion: number
  services: ManagedServiceDefinition[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const PLAINTEXT_SECRETS_FILE = 'managed-services-secrets.json'

const asString = (value: unknown, field: string, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 32_768) {
    throw new Error(`${field} must be a valid string`)
  }
  return value.trim()
}

const asStringArray = (value: unknown, field: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 256 ||
    value.some((item) => typeof item !== 'string')
  ) {
    throw new Error(`${field} must be a string array`)
  }
  return value.map((item) => item as string)
}

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const asInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string
): number => {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`)
  }
  return number
}

const normalizeEnv = (value: unknown): Record<string, string> => {
  if (value === undefined) return {}
  if (!isRecord(value) || Object.keys(value).length > 100) {
    throw new Error('env must be an object with at most 100 entries')
  }
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof entry !== 'string') {
      throw new Error(`Invalid environment variable: ${key}`)
    }
    env[key] = entry
  }
  return env
}

const createId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return `${slug || 'service'}-${randomBytes(4).toString('hex')}`
}

export const normalizeServiceDefinition = (
  value: unknown,
  forcedId?: string
): ManagedServiceDefinition => {
  if (!isRecord(value)) throw new Error('Service must be an object')

  const name = asString(value.name, 'name')
  const idValue = forcedId ?? (typeof value.id === 'string' ? value.id : createId(name))
  const id = asString(idValue, 'id').toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
    throw new Error('id may only contain letters, numbers, dots, underscores, and hyphens')
  }

  const type = value.type === 'mcpo' ? 'mcpo' : value.type === 'generic' ? 'generic' : null
  if (!type) throw new Error('type must be generic or mcpo')

  const base: ManagedServiceDefinition = {
    id,
    name,
    type,
    command: type === 'generic' ? asString(value.command, 'command') : '',
    args: type === 'generic' ? asStringArray(value.args ?? [], 'args') : [],
    enabled: asBoolean(value.enabled, false),
    autoRestart: asBoolean(value.autoRestart, true),
    restartLimit: asInteger(value.restartLimit, 3, 0, 20, 'restartLimit'),
    startupTimeoutMs: asInteger(
      value.startupTimeoutMs,
      120_000,
      1_000,
      600_000,
      'startupTimeoutMs'
    ),
    env: normalizeEnv(value.env)
  }

  if (value.cwd !== undefined && value.cwd !== '') base.cwd = asString(value.cwd, 'cwd')

  if (type === 'mcpo') {
    if (!isRecord(value.mcpo)) throw new Error('mcpo settings are required')
    base.mcpo = {
      serverCommand: asString(value.mcpo.serverCommand, 'mcpo.serverCommand'),
      serverArgs: asStringArray(value.mcpo.serverArgs ?? [], 'mcpo.serverArgs'),
      port: asInteger(value.mcpo.port, 8000, 1, 65_535, 'mcpo.port')
    }
    return materializeMcpoService(base)
  }

  if (value.healthCheckUrl !== undefined && value.healthCheckUrl !== '') {
    base.healthCheckUrl = assertLocalHealthCheckUrl(
      asString(value.healthCheckUrl, 'healthCheckUrl')
    )
  }
  return base
}

const commandForDisplay = (service: ManagedServiceDefinition): string =>
  [service.command, ...service.args]
    .map((part) => (/\s|"/.test(part) ? JSON.stringify(part) : part))
    .join(' ')

export class ManagedServicesRegistry {
  private services = new Map<string, ManagedServiceDefinition>()
  private secrets = new Map<string, SecretPayload>()
  private plaintextFallback = new Map<string, SecretPayload>()
  private loaded = false

  async load(): Promise<void> {
    if (this.loaded) return
    const config = await getConfig()
    const raw = (config as unknown as Record<string, unknown>).managedServices
    const persisted = this.migrate(raw, config)
    this.plaintextFallback = await this.readPlaintextFallback()

    for (const stored of persisted.services) {
      try {
        const secret = this.decryptSecret(stored.id, persisted)
        const service = normalizeServiceDefinition({ ...stored, env: secret.env }, stored.id)
        this.services.set(service.id, service)
        this.secrets.set(service.id, {
          apiKey: service.type === 'mcpo' ? secret.apiKey || this.generateApiKey() : undefined,
          env: secret.env
        })
      } catch (error) {
        log.error(`Skipping invalid managed service ${stored.id ?? '<unknown>'}:`, error)
      }
    }

    this.loaded = true
    await this.persist()
  }

  list(redactEnvironment = true): ManagedServiceDefinition[] {
    return [...this.services.values()].map((service) => ({
      ...service,
      args: [...service.args],
      env: Object.fromEntries(
        Object.keys(service.env ?? {}).map((key) => [
          key,
          redactEnvironment ? '' : (service.env?.[key] ?? '')
        ])
      ),
      mcpo: service.mcpo ? { ...service.mcpo, serverArgs: [...service.mcpo.serverArgs] } : undefined
    }))
  }

  get(id: string, includeEnvironment = false): ManagedServiceDefinition | undefined {
    const service = this.services.get(id)
    if (!service) return undefined
    return {
      ...service,
      args: [...service.args],
      env: includeEnvironment
        ? { ...(this.secrets.get(id)?.env ?? {}) }
        : Object.fromEntries(Object.keys(service.env ?? {}).map((key) => [key, ''])),
      mcpo: service.mcpo ? { ...service.mcpo, serverArgs: [...service.mcpo.serverArgs] } : undefined
    }
  }

  getApiKey(id: string): string | undefined {
    return this.secrets.get(id)?.apiKey
  }

  preview(value: unknown): ManagedServiceDefinition {
    return normalizeServiceDefinition(value)
  }

  async upsert(value: unknown): Promise<ManagedServiceDefinition> {
    const incomingId = isRecord(value) && typeof value.id === 'string' ? value.id : undefined
    const current = incomingId ? this.services.get(incomingId) : undefined
    const service = normalizeServiceDefinition(value, current?.id)
    this.assertUniquePort(service)

    const secret: SecretPayload = {
      apiKey:
        service.type === 'mcpo'
          ? (this.secrets.get(service.id)?.apiKey ?? this.generateApiKey())
          : undefined,
      env: { ...(service.env ?? {}) }
    }
    this.services.set(service.id, service)
    this.secrets.set(service.id, secret)
    await this.persist()
    return this.get(service.id, true)!
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.services.delete(id)
    this.secrets.delete(id)
    if (removed) await this.persist()
    return removed
  }

  async replaceFromImport(services: ManagedServiceDefinition[]): Promise<void> {
    const nextServices = new Map<string, ManagedServiceDefinition>()
    const nextSecrets = new Map<string, SecretPayload>()
    for (const entry of services) {
      const service = normalizeServiceDefinition({ ...entry, env: {} }, entry.id)
      if (nextServices.has(service.id)) throw new Error(`Duplicate service id: ${service.id}`)
      nextServices.set(service.id, service)
      nextSecrets.set(service.id, {
        apiKey: service.type === 'mcpo' ? this.generateApiKey() : undefined,
        env: {}
      })
    }
    this.assertAllPortsUnique([...nextServices.values()])
    this.services = nextServices
    this.secrets = nextSecrets
    await this.persist()
  }

  exportSanitized(): ExportedRegistry {
    return {
      schemaVersion: MANAGED_SERVICES_SCHEMA_VERSION,
      services: this.list().map((service) => ({
        ...service,
        env: Object.fromEntries(Object.keys(service.env ?? {}).map((key) => [key, '']))
      }))
    }
  }

  parseImport(value: unknown): ExportedRegistry {
    if (!isRecord(value) || !Array.isArray(value.services)) {
      throw new Error('The selected file is not a managed-services registry')
    }
    const schemaVersion = asInteger(
      value.schemaVersion,
      MANAGED_SERVICES_SCHEMA_VERSION,
      1,
      MANAGED_SERVICES_SCHEMA_VERSION,
      'schemaVersion'
    )
    const services = value.services.map((service) => normalizeServiceDefinition(service))
    this.assertAllPortsUnique(services)
    return { schemaVersion, services }
  }

  commandPreview(service: ManagedServiceDefinition): string {
    return commandForDisplay(service)
  }

  private migrate(raw: unknown, config: AppConfig): PersistedRegistry {
    if (!isRecord(raw)) {
      return {
        schemaVersion: MANAGED_SERVICES_SCHEMA_VERSION,
        services: createDefaultServices(readLegacyAutostartEnabled(config))
      }
    }

    const schemaVersion = Number(raw.schemaVersion ?? 0)
    if (schemaVersion > MANAGED_SERVICES_SCHEMA_VERSION) {
      throw new Error(
        `Managed-services schema ${schemaVersion} is newer than supported schema ${MANAGED_SERVICES_SCHEMA_VERSION}`
      )
    }

    if (!Array.isArray(raw.services)) {
      return {
        schemaVersion: MANAGED_SERVICES_SCHEMA_VERSION,
        services: createDefaultServices(readLegacyAutostartEnabled(config))
      }
    }

    return {
      schemaVersion: MANAGED_SERVICES_SCHEMA_VERSION,
      services: raw.services as PersistedService[],
      encryptedSecrets: isRecord(raw.encryptedSecrets)
        ? (raw.encryptedSecrets as Record<string, string>)
        : undefined
    }
  }

  private decryptSecret(id: string, persisted: PersistedRegistry): SecretPayload {
    const encrypted = persisted.encryptedSecrets?.[id]
    if (encrypted) {
      try {
        if (!safeStorage.isEncryptionAvailable()) {
          log.warn(`Cannot decrypt secrets for managed service ${id}; OS encryption is unavailable`)
          return { env: {} }
        }
        const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')))
        return {
          apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
          env: normalizeEnv(parsed.env)
        }
      } catch (error) {
        log.error(`Failed to decrypt secrets for managed service ${id}:`, error)
        return { env: {} }
      }
    }

    const plaintext = this.plaintextFallback.get(id)
    if (plaintext) {
      log.warn(
        `Managed service ${id} secrets are stored in plaintext; OS encryption is unavailable`
      )
      return {
        apiKey: typeof plaintext.apiKey === 'string' ? plaintext.apiKey : undefined,
        env: normalizeEnv(plaintext.env)
      }
    }
    return { env: {} }
  }

  private async persist(): Promise<void> {
    const encryptedSecrets: Record<string, string> = {}
    const plaintextSecrets: Record<string, SecretPayload> = {}
    const encryptionAvailable = safeStorage.isEncryptionAvailable()

    if (!encryptionAvailable) {
      log.warn(
        'Electron safeStorage is unavailable; managed-service secrets will be stored in plaintext'
      )
    }

    for (const [id, payload] of this.secrets) {
      if (encryptionAvailable) {
        encryptedSecrets[id] = safeStorage.encryptString(JSON.stringify(payload)).toString('base64')
      } else {
        plaintextSecrets[id] = payload
      }
    }

    if (encryptionAvailable) await this.removePlaintextFallback()
    else await this.writePlaintextFallback(plaintextSecrets)

    const persisted: PersistedRegistry = {
      schemaVersion: MANAGED_SERVICES_SCHEMA_VERSION,
      services: [...this.services.values()].map(({ env, ...service }) => ({
        ...service,
        envKeys: Object.keys(env ?? {})
      })),
      ...(encryptionAvailable ? { encryptedSecrets } : {})
    }

    await setConfig({ managedServices: persisted } as unknown as Partial<AppConfig>)
  }

  private generateApiKey(): string {
    return randomBytes(32).toString('base64url')
  }

  private async readPlaintextFallback(): Promise<Map<string, SecretPayload>> {
    const filePath = join(getUserDataPath(), PLAINTEXT_SECRETS_FILE)
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'))
      if (!isRecord(parsed)) return new Map()
      log.warn('Managed-service secrets are stored in plaintext; OS encryption is unavailable')
      return new Map(
        Object.entries(parsed).map(([id, value]) => {
          if (!isRecord(value)) return [id, { env: {} }]
          return [
            id,
            {
              apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
              env: normalizeEnv(value.env)
            }
          ]
        })
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.error('Failed to read plaintext managed-service secrets:', error)
      }
      return new Map()
    }
  }

  private async writePlaintextFallback(secrets: Record<string, SecretPayload>): Promise<void> {
    const filePath = join(getUserDataPath(), PLAINTEXT_SECRETS_FILE)
    const temporaryPath = `${filePath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(secrets, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporaryPath, filePath)
  }

  private async removePlaintextFallback(): Promise<void> {
    try {
      await unlink(join(getUserDataPath(), PLAINTEXT_SECRETS_FILE))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('Failed to remove obsolete plaintext managed-service secrets:', error)
      }
    }
  }

  private assertUniquePort(service: ManagedServiceDefinition): void {
    const targetPort = getPortFromService(service.healthCheckUrl, service.mcpo?.port)
    if (!targetPort) return
    for (const existing of this.services.values()) {
      if (existing.id === service.id) continue
      const port = getPortFromService(existing.healthCheckUrl, existing.mcpo?.port)
      if (port === targetPort) {
        throw new Error(`Port ${targetPort} is already assigned to ${existing.name}`)
      }
    }
  }

  private assertAllPortsUnique(services: ManagedServiceDefinition[]): void {
    const ports = new Map<number, string>()
    for (const service of services) {
      const port = getPortFromService(service.healthCheckUrl, service.mcpo?.port)
      if (!port) continue
      const owner = ports.get(port)
      if (owner) throw new Error(`Port ${port} is assigned to both ${owner} and ${service.name}`)
      ports.set(port, service.name)
    }
  }
}
