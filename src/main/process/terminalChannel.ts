import { MessageChannelMain, type WebContents } from 'electron'
import type { ManagedService } from './managedService'
import { OutputBuffer } from './outputBuffer'

// One attachment owns its port and subscription. A slow view gets bounded output,
// with one packet in flight until xterm acknowledges consuming it.
export function attachTerminal(
  service: ManagedService,
  owner: WebContents,
  connectionId: number
): void {
  const { port1: port, port2 } = new MessageChannelMain()
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
    owner.removeListener('destroyed', dispose)
    owner.removeListener('render-process-gone', dispose)
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
  owner.once('destroyed', dispose)
  owner.once('render-process-gone', dispose)
  try {
    owner.postMessage('terminal:port', connectionId, [port2])
  } catch {
    port2.close()
    dispose()
    return
  }
  port.start()
  reset()
  pending.append(service.logs)
  flush()
}
