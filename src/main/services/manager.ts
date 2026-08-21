import { spawn, type ChildProcess } from 'child_process'

import { app, BrowserWindow, type Event } from 'electron'
import log from 'electron-log'

import {
  MCPO_API_KEY_PLACEHOLDER,
  type ManagedServiceDefinition,
  type ManagedServiceIntegration,
  type ManagedServiceSnapshot,
  type ManagedServiceStatus
} from '../../shared/services/types'
import {
  delay,
  getPortFromService,
  isHealthCheckReady,
  isPortInUse,
  waitForPortToClose
} from './network'
import { ManagedServicesRegistry } from './registry'
import { LineRingBuffer } from './ring-buffer'

interface ServiceRuntime {
  definition: ManagedServiceDefinition
  status: ManagedServiceStatus
  process: ChildProcess | null
  ownsProcess: boolean
  stopRequested: boolean
  restartCount: number
  restartTimer: NodeJS.Timeout | null
  lastError?: string
  logs: LineRingBuffer
  generation: number
}

const broadcast = (type: string, data: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('main:data', { type, data })
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class ManagedServicesManager {
  private readonly runtimes = new Map<string, ServiceRuntime>()
  private shuttingDown = false
  private quitComplete = false
  private quitPromise: Promise<void> | null = null

  constructor(readonly registry: ManagedServicesRegistry) {}

  async initialize(): Promise<void> {
    await this.registry.load()
    this.rebuildRuntimes()
    app.on('before-quit', this.handleBeforeQuit)

    for (const runtime of this.runtimes.values()) {
      if (runtime.definition.enabled) void this.start(runtime.definition.id)
    }
  }

  list(): ManagedServiceSnapshot[] {
    return [...this.runtimes.values()].map((runtime) => this.snapshot(runtime))
  }

  getDefinition(id: string): ManagedServiceDefinition {
    const service = this.registry.get(this.validateId(id), true)
    if (!service) throw new Error(`Unknown managed service: ${id}`)
    return service
  }

  getLogs(id: string): string[] {
    return this.getRuntime(id).logs.toArray()
  }

  getIntegration(id: string): ManagedServiceIntegration {
    const runtime = this.getRuntime(id)
    if (runtime.definition.type !== 'mcpo' || !runtime.definition.mcpo) {
      throw new Error('Integration details are only available for mcpo services')
    }
    const bearerKey = this.registry.getApiKey(runtime.definition.id)
    if (!bearerKey) throw new Error('The mcpo API key is unavailable')

    return {
      url: `http://127.0.0.1:${runtime.definition.mcpo.port}`,
      bearerKey,
      commandPreview: this.registry
        .commandPreview(runtime.definition)
        .replace(MCPO_API_KEY_PLACEHOLDER, bearerKey)
    }
  }

  async upsert(value: unknown): Promise<ManagedServiceSnapshot> {
    const service = await this.registry.upsert(value)
    const existing = this.runtimes.get(service.id)
    if (existing) {
      await this.stop(service.id, true)
      existing.definition = service
      existing.restartCount = 0
      existing.lastError = undefined
    } else {
      this.runtimes.set(service.id, this.createRuntime(service))
    }

    this.emitRegistryChanged()
    if (service.enabled) await this.start(service.id)
    return this.snapshot(this.getRuntime(service.id))
  }

  async remove(id: string): Promise<boolean> {
    const validId = this.validateId(id)
    if (this.runtimes.has(validId)) await this.stop(validId, true)
    const removed = await this.registry.remove(validId)
    this.runtimes.delete(validId)
    if (removed) this.emitRegistryChanged()
    return removed
  }

  async replaceAll(services: ManagedServiceDefinition[]): Promise<void> {
    await this.stopAll()
    await this.registry.replaceFromImport(services)
    this.rebuildRuntimes()
    this.emitRegistryChanged()
    for (const runtime of this.runtimes.values()) {
      if (runtime.definition.enabled) void this.start(runtime.definition.id)
    }
  }

  async start(id: string, automaticRestart = false): Promise<ManagedServiceSnapshot> {
    const runtime = this.getRuntime(id)
    if (runtime.status === 'starting' || runtime.status === 'running') return this.snapshot(runtime)
    if (this.shuttingDown) throw new Error('The app is shutting down')

    if (!automaticRestart) runtime.restartCount = 0
    runtime.stopRequested = false
    runtime.lastError = undefined
    runtime.generation += 1
    const generation = runtime.generation
    this.setStatus(runtime, 'starting')

    const port = getPortFromService(
      runtime.definition.healthCheckUrl,
      runtime.definition.mcpo?.port
    )
    if (port && (await isPortInUse(port))) {
      const ready = runtime.definition.healthCheckUrl
        ? await isHealthCheckReady(runtime.definition.healthCheckUrl)
        : false
      if (ready) {
        runtime.ownsProcess = false
        runtime.logs.add(
          `Detected an already-running service on port ${port}; no duplicate was started`
        )
        this.setStatus(runtime, 'running')
        return this.snapshot(runtime)
      }
      return this.fail(runtime, `Port ${port} is already in use by another process`, false)
    }

    try {
      const secretKey = this.registry.getApiKey(runtime.definition.id)
      const args = runtime.definition.args.map((argument) =>
        argument === MCPO_API_KEY_PLACEHOLDER ? (secretKey ?? '') : argument
      )
      runtime.logs.add(
        `Starting ${runtime.definition.command} ${runtime.definition.args
          .map((argument) => (argument === MCPO_API_KEY_PLACEHOLDER ? '<redacted>' : argument))
          .join(' ')}`
      )

      const child = spawn(runtime.definition.command, args, {
        cwd: runtime.definition.cwd || undefined,
        env: { ...process.env, ...(runtime.definition.env ?? {}) },
        detached: process.platform !== 'win32',
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      runtime.process = child
      runtime.ownsProcess = true
      child.stdout.on('data', (chunk: Buffer) => runtime.logs.append(chunk.toString(), 'stdout'))
      child.stderr.on('data', (chunk: Buffer) => runtime.logs.append(chunk.toString(), 'stderr'))
      child.once('error', (error) => {
        runtime.logs.add(`Process error: ${error.message}`, 'stderr')
      })
      child.once('exit', (code, signal) => {
        if (runtime.process === child) runtime.process = null
        runtime.ownsProcess = false
        const reason = code !== null ? `exit code ${code}` : `signal ${signal ?? 'unknown'}`
        runtime.logs.add(`Process exited with ${reason}`)
        if (runtime.stopRequested || this.shuttingDown || generation !== runtime.generation) {
          this.setStatus(runtime, 'stopped')
          return
        }
        this.fail(runtime, `Process exited unexpectedly with ${reason}`, true)
      })

      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })

      if (!runtime.definition.healthCheckUrl) {
        if (runtime.process === child && generation === runtime.generation) {
          runtime.logs.add('Process started')
          this.setStatus(runtime, 'running')
        }
        return this.snapshot(runtime)
      }

      const deadline = Date.now() + runtime.definition.startupTimeoutMs
      while (Date.now() < deadline) {
        if (runtime.process !== child || generation !== runtime.generation)
          return this.snapshot(runtime)
        if (await isHealthCheckReady(runtime.definition.healthCheckUrl)) {
          runtime.logs.add(`Health check passed: ${runtime.definition.healthCheckUrl}`)
          this.setStatus(runtime, 'running')
          return this.snapshot(runtime)
        }
        await delay(250)
      }

      runtime.stopRequested = true
      await this.terminateProcessTree(child)
      runtime.stopRequested = false
      return this.fail(
        runtime,
        `Health check did not become ready within ${runtime.definition.startupTimeoutMs} ms`,
        true
      )
    } catch (error) {
      if (runtime.process) {
        runtime.stopRequested = true
        await this.terminateProcessTree(runtime.process).catch(() => undefined)
        runtime.stopRequested = false
      }
      runtime.process = null
      runtime.ownsProcess = false
      return this.fail(runtime, errorMessage(error), true)
    }
  }

  async stop(id: string, allowExternal = false): Promise<ManagedServiceSnapshot> {
    const runtime = this.getRuntime(id)
    const ownedProcess = !!runtime.process && runtime.ownsProcess
    runtime.stopRequested = true
    runtime.generation += 1
    if (runtime.restartTimer) {
      clearTimeout(runtime.restartTimer)
      runtime.restartTimer = null
    }

    if (runtime.process && runtime.ownsProcess) {
      runtime.logs.add(`Stopping process tree for PID ${runtime.process.pid ?? 'unknown'}`)
      try {
        await this.terminateProcessTree(runtime.process)
      } catch (cause) {
        runtime.logs.add(`Process-tree termination failed: ${errorMessage(cause)}`, 'stderr')
      }
    } else if (runtime.status === 'running' && !allowExternal) {
      runtime.lastError = 'The process was already running and is not owned by this app'
      runtime.logs.add(runtime.lastError, 'stderr')
      this.setStatus(runtime, 'failed')
      runtime.stopRequested = false
      return this.snapshot(runtime)
    }

    const port = getPortFromService(
      runtime.definition.healthCheckUrl,
      runtime.definition.mcpo?.port
    )
    if (ownedProcess && port && !(await waitForPortToClose(port))) {
      runtime.lastError = `Port ${port} is still occupied after stopping the process tree`
      runtime.logs.add(runtime.lastError, 'stderr')
      this.setStatus(runtime, 'failed')
    } else {
      runtime.process = null
      runtime.ownsProcess = false
      runtime.lastError = undefined
      this.setStatus(runtime, 'stopped')
    }
    runtime.stopRequested = false
    return this.snapshot(runtime)
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.runtimes.keys()].map((id) => this.stop(id, true)))
  }

  async suggestPort(): Promise<number> {
    const configured = new Set(
      [...this.runtimes.values()]
        .map((runtime) =>
          getPortFromService(runtime.definition.healthCheckUrl, runtime.definition.mcpo?.port)
        )
        .filter((port): port is number => port !== null)
    )
    for (let port = 8000; port <= 65_535; port += 1) {
      if (!configured.has(port) && !(await isPortInUse(port))) return port
    }
    throw new Error('No free local port is available')
  }

  dispose(): void {
    app.removeListener('before-quit', this.handleBeforeQuit)
  }

  private readonly handleBeforeQuit = (event: Event): void => {
    if (this.quitComplete) return
    event.preventDefault()
    if (this.quitPromise) return

    this.shuttingDown = true
    this.quitPromise = this.stopAll().finally(() => {
      this.quitComplete = true
      app.quit()
    })
  }

  private rebuildRuntimes(): void {
    this.runtimes.clear()
    for (const definition of this.registry.list(false)) {
      this.runtimes.set(definition.id, this.createRuntime(definition))
    }
  }

  private createRuntime(definition: ManagedServiceDefinition): ServiceRuntime {
    return {
      definition,
      status: 'stopped',
      process: null,
      ownsProcess: false,
      stopRequested: false,
      restartCount: 0,
      restartTimer: null,
      logs: new LineRingBuffer(500),
      generation: 0
    }
  }

  private fail(runtime: ServiceRuntime, message: string, restart: boolean): ManagedServiceSnapshot {
    runtime.lastError = message
    runtime.logs.add(message, 'stderr')
    log.error(`Managed service ${runtime.definition.id}: ${message}`)
    this.setStatus(runtime, 'failed')
    if (restart) this.scheduleRestart(runtime)
    return this.snapshot(runtime)
  }

  private scheduleRestart(runtime: ServiceRuntime): void {
    if (
      this.shuttingDown ||
      runtime.stopRequested ||
      !runtime.definition.autoRestart ||
      runtime.restartTimer
    ) {
      return
    }
    if (runtime.restartCount >= runtime.definition.restartLimit) {
      runtime.logs.add(
        `Restart limit (${runtime.definition.restartLimit}) reached; service remains failed`,
        'stderr'
      )
      return
    }

    runtime.restartCount += 1
    const waitMs = Math.min(30_000, 1_000 * 2 ** (runtime.restartCount - 1))
    runtime.logs.add(
      `Automatic restart ${runtime.restartCount}/${runtime.definition.restartLimit} in ${waitMs} ms`
    )
    this.emitStatus(runtime)
    runtime.restartTimer = setTimeout(() => {
      runtime.restartTimer = null
      void this.start(runtime.definition.id, true)
    }, waitMs)
  }

  private async terminateProcessTree(child: ChildProcess): Promise<void> {
    const pid = child.pid
    if (!pid) return

    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          shell: false,
          stdio: 'ignore'
        })
        killer.once('error', reject)
        killer.once('exit', (code) => {
          if (code === 0 || code === 128 || child.exitCode !== null) resolve()
          else reject(new Error(`taskkill exited with code ${code ?? 'unknown'}`))
        })
      })
      return
    }

    try {
      process.kill(-pid, 'SIGTERM')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      return
    }
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2_000)])
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  }

  private getRuntime(id: string): ServiceRuntime {
    const validId = this.validateId(id)
    const runtime = this.runtimes.get(validId)
    if (!runtime) throw new Error(`Unknown managed service: ${validId}`)
    return runtime
  }

  private validateId(id: string): string {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) {
      throw new Error('Invalid managed-service id')
    }
    return id
  }

  private snapshot(runtime: ServiceRuntime): ManagedServiceSnapshot {
    const service = this.registry.get(runtime.definition.id) ?? runtime.definition
    return {
      ...service,
      status: runtime.status,
      pid: runtime.process?.pid,
      restartCount: runtime.restartCount,
      lastError: runtime.lastError,
      externallyManaged: runtime.status === 'running' && !runtime.ownsProcess
    }
  }

  private setStatus(runtime: ServiceRuntime, status: ManagedServiceStatus): void {
    runtime.status = status
    this.emitStatus(runtime)
  }

  private emitStatus(runtime: ServiceRuntime): void {
    broadcast('managed-service:status', this.snapshot(runtime))
  }

  private emitRegistryChanged(): void {
    broadcast('managed-services:changed', this.list())
  }
}
