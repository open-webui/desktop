import { setTimeout as delay } from 'node:timers/promises'
import type { ServiceInfo } from '../../shared/terminal'
import { OutputBuffer } from './outputBuffer'

export interface PtyProcess {
  pid: number
  onData(callback: (data: string) => void): { dispose(): void }
  onExit(callback: (exit: { exitCode: number; signal?: number }) => void): { dispose(): void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(force: boolean): void | Promise<void>
}
export interface ServiceLaunch {
  file: string
  args: string[]
  env: Record<string, string>
  url: string
  ready(signal: AbortSignal): Promise<void>
}
type ServiceEvent =
  | { type: 'state'; info: ServiceInfo }
  | { type: 'output'; data: string }
  | { type: 'reset' }
type ServiceRun = {
  id: number
  abort: AbortController
  child?: PtyProcess
  exited: boolean
  stopRequested: boolean
  exit: Promise<void>
  resolveExit(): void
  dispose: Array<() => void>
  stopping?: Promise<void>
}

export class ManagedService {
  private run?: ServiceRun
  private pending?: Promise<ServiceInfo>
  private stopping?: Promise<void>
  private closed = false
  private listeners = new Set<(event: ServiceEvent) => void>()
  private output = new OutputBuffer()
  private state: ServiceInfo = {
    runId: 0,
    status: 'stopped',
    pid: null,
    url: null,
    reachable: false,
    error: null
  }

  constructor(
    private readonly spawn: (launch: ServiceLaunch) => PtyProcess,
    readonly interactive = false,
    private readonly stopTimeout = 2000
  ) {}

  get info(): ServiceInfo {
    return { ...this.state }
  }
  get logs(): string {
    return this.output.read()
  }

  subscribe(listener: (event: ServiceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: ServiceEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private update(patch: Partial<ServiceInfo>): void {
    this.state = { ...this.state, ...patch }
    this.emit({ type: 'state', info: this.info })
  }

  clearLogs(): void {
    this.output.clear()
    this.emit({ type: 'reset' })
  }

  private append(data: string): void {
    this.output.append(data)
    this.emit({ type: 'output', data })
  }

  start(prepare: (signal: AbortSignal) => Promise<ServiceLaunch>): Promise<ServiceInfo> {
    if (this.closed) return Promise.reject(new Error('Service is shutting down'))
    if (this.stopping) return this.stopping.then(() => this.start(prepare))
    if (this.pending) return this.pending
    if (this.state.status === 'started') return Promise.resolve(this.info)
    if (this.run?.child && !this.run.exited)
      return Promise.reject(new Error('Previous process has not exited'))

    let resolveExit!: () => void
    const run: ServiceRun = {
      id: this.state.runId + 1,
      abort: new AbortController(),
      exited: false,
      stopRequested: false,
      dispose: [],
      exit: new Promise<void>((resolve) => {
        resolveExit = resolve
      }),
      resolveExit: () => resolveExit()
    }
    this.run = run
    // Reserve the run before any asynchronous preparation or listener callbacks.
    const pending = Promise.resolve().then(async () => {
      const signal = run.abort.signal
      try {
        signal.throwIfAborted()
        const launch = await prepare(signal)
        signal.throwIfAborted()
        const child = this.spawn(launch)
        run.child = child
        run.dispose.push(
          child.onData((data) => {
            if (this.run === run && !run.exited) this.append(data)
          }).dispose
        )
        run.dispose.push(
          child.onExit(({ exitCode, signal: exitSignal }) => {
            if (run.exited) return
            run.exited = true
            run.resolveExit()
            run.abort.abort(new Error(`Process exited with code ${exitCode}`))
            for (const dispose of run.dispose.splice(0)) dispose()
            if (this.run !== run) return
            this.append(
              `\r\n[Process exited with code ${exitCode}${exitSignal ? ` signal ${exitSignal}` : ''}]\r\n`
            )
            const failed = !run.stopRequested && (exitCode !== 0 || this.state.status !== 'started')
            this.update({
              pid: null,
              url: null,
              reachable: false,
              status: failed ? 'failed' : 'stopped',
              error: failed ? `Process exited with code ${exitCode}` : null
            })
          }).dispose
        )
        this.update({ pid: child.pid, url: launch.url })
        // Race even a non-cooperative readiness probe against cancellation/exit.
        await abortable(launch.ready(signal), signal)
        signal.throwIfAborted()
        this.update({ status: 'started', reachable: true })
        return this.info
      } catch (error) {
        const cancelled = run.stopRequested
        let failure = error
        try {
          await this.stopProcess(run)
        } catch (stopError) {
          failure = stopError
        }
        if (this.run === run && (!cancelled || failure !== error)) {
          const message = failure instanceof Error ? failure.message : String(failure)
          this.append(`\r\n[Failed: ${message}]\r\n`)
          this.update({ status: 'failed', reachable: false, error: message })
        }
        throw failure
      } finally {
        if (this.pending === pending) this.pending = undefined
      }
    })
    this.pending = pending
    this.clearLogs()
    this.update({
      runId: run.id,
      status: 'starting',
      pid: null,
      url: null,
      reachable: false,
      error: null
    })
    return pending
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    const run = this.run
    if (!run) return Promise.resolve()
    const pending = this.pending
    run.stopRequested = true
    run.abort.abort(new Error('Service start cancelled'))
    const stopping = Promise.resolve().then(async () => {
      try {
        // Preparation must finish before a replacement can touch the same files.
        await pending?.catch(() => {})
        await this.stopProcess(run)
        this.update({ status: 'stopped', pid: null, url: null, reachable: false, error: null })
      } catch (error) {
        this.update({
          status: 'failed',
          reachable: false,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      } finally {
        if (this.stopping === stopping) this.stopping = undefined
      }
    })
    this.stopping = stopping
    this.update({ status: 'stopping', reachable: false })
    return stopping
  }

  shutdown(): Promise<void> {
    this.closed = true
    return this.stop()
  }

  private stopProcess(run: ServiceRun): Promise<void> {
    if (run.stopping) return run.stopping
    if (!run.child || run.exited) return Promise.resolve()
    const child = run.child
    run.stopping = (async () => {
      try {
        await child.kill(false)
      } catch {
        /* Escalate if graceful termination fails. */
      }
      if (!(await settlesWithin(run.exit, this.stopTimeout))) {
        await child.kill(true)
        if (!(await settlesWithin(run.exit, this.stopTimeout)))
          throw new Error(`Process ${child.pid} did not exit`)
      }
    })().finally(() => {
      run.stopping = undefined
    })
    return run.stopping
  }

  write(runId: number, data: unknown): void {
    if (
      this.interactive &&
      runId === this.state.runId &&
      typeof data === 'string' &&
      data.length <= 65536 &&
      !this.run?.exited
    ) {
      this.run?.child?.write(data)
    }
  }

  resize(runId: number, cols: number, rows: number): void {
    if (
      runId === this.state.runId &&
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols > 0 &&
      rows > 0 &&
      cols <= 1000 &&
      rows <= 1000 &&
      !this.run?.exited
    ) {
      this.run?.child?.resize(cols, rows)
    }
  }
}

async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void
  return new Promise<T>((resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject)
    if (signal.aborted) abort()
  }).finally(() => signal.removeEventListener('abort', abort))
}

export async function waitForReady(
  probe: (signal: AbortSignal) => Promise<boolean>,
  signal: AbortSignal,
  timeout = 120000,
  interval = 500
): Promise<void> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeout)])
  while (true) {
    deadline.throwIfAborted()
    try {
      if (
        await abortable(probe(AbortSignal.any([deadline, AbortSignal.timeout(2000)])), deadline)
      ) {
        deadline.throwIfAborted()
        return
      }
    } catch {
      deadline.throwIfAborted()
    }
    await delay(interval, undefined, { signal: deadline })
  }
}
