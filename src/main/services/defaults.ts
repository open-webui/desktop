import { homedir } from 'os'
import { join } from 'path'

import {
  MCPO_API_KEY_PLACEHOLDER,
  type ManagedServiceDefinition
} from '../../shared/services/types'

const DEFAULT_RESTART_LIMIT = 3
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000

const getUvxPath = (): string =>
  join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'uvx.exe' : 'uvx')

const createMcpoArgs = (
  host: string,
  port: number,
  serverCommand: string,
  serverArgs: string[]
): string[] => [
  '--with',
  'mcp==1.9.4',
  'mcpo',
  '--host',
  host,
  '--port',
  String(port),
  '--api-key',
  MCPO_API_KEY_PLACEHOLDER,
  '--',
  serverCommand,
  ...serverArgs
]

export const materializeMcpoService = (
  service: ManagedServiceDefinition
): ManagedServiceDefinition => {
  if (service.type !== 'mcpo' || !service.mcpo) return service

  const host = '127.0.0.1'
  return {
    ...service,
    command: getUvxPath(),
    args: createMcpoArgs(
      host,
      service.mcpo.port,
      service.mcpo.serverCommand,
      service.mcpo.serverArgs
    ),
    healthCheckUrl: `http://${host}:${service.mcpo.port}/docs`
  }
}

const createOmniRouteDefault = (enabled: boolean): ManagedServiceDefinition => {
  const programFilesPath = process.env.ProgramFiles ?? ''
  const appDataPath = process.env.APPDATA ?? ''

  return {
    id: 'omniroute',
    name: 'OmniRoute',
    type: 'generic',
    command:
      process.platform === 'win32' && programFilesPath
        ? join(programFilesPath, 'nodejs', 'node.exe')
        : 'node',
    args: [
      appDataPath
        ? join(appDataPath, 'npm', 'node_modules', 'omniroute', 'bin', 'omniroute.mjs')
        : 'omniroute',
      'serve',
      '--no-open',
      '--max-restarts',
      '0'
    ],
    enabled: process.platform === 'win32' ? enabled : false,
    healthCheckUrl: 'http://127.0.0.1:20128/v1/models',
    autoRestart: true,
    restartLimit: DEFAULT_RESTART_LIMIT,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS
  }
}

const createGarminDefault = (): ManagedServiceDefinition => {
  const serverCommand = join(
    homedir(),
    '.local',
    'bin',
    process.platform === 'win32' ? 'garmin-mcp.exe' : 'garmin-mcp'
  )

  return materializeMcpoService({
    id: 'garmin-mcp',
    name: 'Garmin MCP',
    type: 'mcpo',
    command: '',
    args: [],
    enabled: false,
    autoRestart: true,
    restartLimit: DEFAULT_RESTART_LIMIT,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    mcpo: {
      serverCommand,
      serverArgs: [],
      port: 8000
    }
  })
}

export const readLegacyAutostartEnabled = (config: unknown): boolean => {
  if (!config || typeof config !== 'object') return false
  const value = config as Record<string, unknown>
  if (typeof value.startOmniRouteAutomatically === 'boolean') {
    return value.startOmniRouteAutomatically
  }

  const omniRoute = value.omniRoute
  return !!(
    omniRoute &&
    typeof omniRoute === 'object' &&
    (omniRoute as Record<string, unknown>).enabled === true
  )
}

export const createDefaultServices = (legacyEnabled: boolean): ManagedServiceDefinition[] => [
  createOmniRouteDefault(legacyEnabled),
  createGarminDefault()
]
