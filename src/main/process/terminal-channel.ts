import type { MessagePortMain } from 'electron'
import type { ManagedService } from './managed-service'
import { OutputBuffer } from './output-buffer'

// One attachment owns its port and subscription. A slow view gets bounded output,
// with one packet in flight until xterm acknowledges consuming it.
export function attachTerminal(service: ManagedService, port: MessagePortMain): () => void {
  const pending = new OutputBuffer()
  let disposed = false
  let sequence = 0
  let waiting = 0
  let runId = service.info.runId
  const send = (message: unknown): void => {
    if (!disposed) {
      try {
        port.postMessage(message)
      } catch {
        dispose()
      }
    }
  }
  const flush = (): void => {
    if (waiting || disposed) return
    const data = pending.read()
    if (!data) return
    pending.clear()
    waiting = ++sequence
    send({ type: 'output', data, sequence: waiting })
  }
  const reset = (): void => {
    pending.clear()
    waiting = 0
    send({ type: 'reset', runId })
  }
  const unsubscribe = service.subscribe((event) => {
    if (event.type === 'output') {
      pending.append(event.data)
      flush()
    } else if (event.type === 'reset') reset()
    else if (event.info.runId !== runId) {
      runId = event.info.runId
      reset()
    }
  })
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    unsubscribe()
    pending.clear()
    port.removeListener('message', onMessage)
    port.removeListener('close', dispose)
    port.close()
  }
  const onMessage = ({ data }: { data: unknown }): void => {
    if (!data || typeof data !== 'object' || disposed) return
    const message = data as Record<string, unknown>
    if (message.type === 'ack' && message.sequence === waiting) {
      waiting = 0
      flush()
    } else if (message.runId === runId) {
      try {
        if (message.type === 'input') service.write(runId, message.data)
        if (
          message.type === 'resize' &&
          typeof message.cols === 'number' &&
          typeof message.rows === 'number'
        ) {
          service.resize(runId, message.cols, message.rows)
        }
      } catch {
        dispose()
      }
    }
  }
  port.on('message', onMessage)
  port.on('close', dispose)
  port.start()
  reset()
  pending.append(service.logs)
  flush()
  return dispose
}
