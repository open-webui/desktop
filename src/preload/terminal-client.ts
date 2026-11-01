import type { ServiceId, TerminalOutput } from '../shared/terminal'

type OutputCallback = (message: TerminalOutput, consumed: () => void) => void
interface TerminalClient {
  connect(service: ServiceId, output: OutputCallback): number
  accept(id: number, port: MessagePort): void
  disconnect(id: number): void
  dispose(): void
  write(id: number, data: string): void
  resize(id: number, cols: number, rows: number): void
}

export function createTerminalClient(
  request: (service: ServiceId, id: number) => void
): TerminalClient {
  let nextId = 0
  const connections = new Map<
    number,
    {
      port?: MessagePort
      runId: number
      output: OutputCallback
    }
  >()
  const client: TerminalClient = {
    connect(service: ServiceId, output: OutputCallback): number {
      const id = ++nextId
      connections.set(id, { runId: 0, output })
      request(service, id)
      return id
    },
    accept(id: number, port: MessagePort): void {
      const connection = connections.get(id)
      if (!connection) {
        port.close()
        return
      }
      connection.port?.close()
      connection.port = port
      port.onmessage = ({ data: message }: MessageEvent<TerminalOutput>) => {
        if (connections.get(id) !== connection || connection.port !== port) return
        if (message.type === 'reset') connection.runId = message.runId
        connection.output(message, () => {
          if (
            message.type === 'output' &&
            connections.get(id) === connection &&
            connection.port === port
          ) {
            port.postMessage({ type: 'ack', sequence: message.sequence })
          }
        })
      }
      port.start()
    },
    disconnect(id: number): void {
      const connection = connections.get(id)
      connections.delete(id)
      if (connection?.port) {
        connection.port.onmessage = null
        connection.port.close()
      }
    },
    dispose(): void {
      for (const id of connections.keys()) client.disconnect(id)
    },
    write(id: number, data: string): void {
      const connection = connections.get(id)
      connection?.port?.postMessage({ type: 'input', runId: connection.runId, data })
    },
    resize(id: number, cols: number, rows: number): void {
      const connection = connections.get(id)
      connection?.port?.postMessage({ type: 'resize', runId: connection.runId, cols, rows })
    }
  }
  return client
}
