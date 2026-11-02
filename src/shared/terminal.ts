export type ServiceId = 'server' | 'llamacpp' | 'ollama'
export type ServiceStatus = 'starting' | 'started' | 'stopping' | 'stopped' | 'failed'
export interface ServiceInfo {
  runId: number
  status: ServiceStatus
  pid: number | null
  url: string | null
  reachable: boolean
  error: string | null
}
export type TerminalOutput =
  | { type: 'output'; data: string; sequence: number }
  | { type: 'reset'; runId: number }
