export const MANAGED_SERVICES_SCHEMA_VERSION = 1
export const MCPO_API_KEY_PLACEHOLDER = '{{MCPO_API_KEY}}'

export type ManagedServiceType = 'generic' | 'mcpo'
export type ManagedServiceStatus = 'stopped' | 'starting' | 'running' | 'failed'

export interface McpoServiceOptions {
  serverCommand: string
  serverArgs: string[]
  port: number
}

export interface ManagedServiceDefinition {
  id: string
  name: string
  type: ManagedServiceType
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  enabled: boolean
  healthCheckUrl?: string
  autoRestart: boolean
  restartLimit: number
  startupTimeoutMs: number
  mcpo?: McpoServiceOptions
}

export interface ManagedServiceSnapshot extends ManagedServiceDefinition {
  status: ManagedServiceStatus
  pid?: number
  restartCount: number
  lastError?: string
  externallyManaged?: boolean
}

export interface ManagedServiceIntegration {
  url: string
  bearerKey: string
  commandPreview: string
}

export interface ManagedServiceImportPreview {
  token: string
  schemaVersion: number
  services: Array<{
    id: string
    name: string
    type: ManagedServiceType
    commandPreview: string
  }>
  warnings: string[]
}

export type ManagedServicesRequest =
  | { action: 'list' }
  | { action: 'get'; id: string }
  | { action: 'preview'; service: unknown }
  | { action: 'upsert'; service: unknown }
  | { action: 'remove'; id: string }
  | { action: 'start'; id: string }
  | { action: 'stop'; id: string }
  | { action: 'logs'; id: string }
  | { action: 'integration'; id: string }
  | { action: 'suggest-port' }
  | { action: 'export' }
  | { action: 'import-preview' }
  | { action: 'import-confirm'; token: string }
  | { action: 'import-cancel'; token: string }
