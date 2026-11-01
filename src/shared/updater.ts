export interface UpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'up-to-date'
    | 'error'
    | 'unsupported'
  version?: string
  percent?: number
  error?: string
  reason?: 'development' | 'managed' | 'unsupported'
}
