import http from 'http'
import https from 'https'
import net from 'net'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

export const getPortFromService = (healthCheckUrl?: string, mcpoPort?: number): number | null => {
  if (mcpoPort) return mcpoPort
  if (!healthCheckUrl) return null
  try {
    const url = new URL(healthCheckUrl)
    if (url.port) return Number(url.port)
    return url.protocol === 'https:' ? 443 : 80
  } catch {
    return null
  }
}

export const assertLocalHealthCheckUrl = (value: string): string => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Health-check URLs must use HTTP(S) on localhost')
  }
  return url.toString()
}

export const isPortInUse = (port: number, timeoutMs = 500): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let settled = false
    const finish = (result: boolean): void => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })

export const isHealthCheckReady = (healthCheckUrl: string, timeoutMs = 2_000): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (result: boolean): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    try {
      const url = new URL(healthCheckUrl)
      const client = url.protocol === 'https:' ? https : http
      const request = client.get(url, (response) => {
        request.setTimeout(0)
        response.on('error', () => finish(false))
        response.resume()
        finish(response.statusCode !== undefined && response.statusCode < 500)
      })
      request.setTimeout(timeoutMs)
      request.once('error', () => finish(false))
      request.once('timeout', () => {
        request.destroy()
        finish(false)
      })
    } catch {
      finish(false)
    }
  })

export const waitForPortToClose = async (port: number, timeoutMs = 5_000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isPortInUse(port))) return true
    await delay(150)
  }
  return !(await isPortInUse(port))
}
