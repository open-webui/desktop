// @ts-nocheck

/**
 * ServiceLock — reusable singleton lock for managed child processes.
 *
 * In Node.js, the synchronous check-and-set before any `await` is atomic
 * (event loop guarantees no interleaving). This class makes that pattern
 * explicit and self-documenting.
 *
 * Usage:
 *   const lock = new ServiceLock('my-service')
 *   if (!lock.acquire()) return existingResult
 *   try { ... } catch { lock.release() }
 *   // release in stop(), not in start()
 */

import log from 'electron-log'

export class ServiceLock {
  private locked = false
  private name: string

  constructor(name: string) {
    this.name = name
  }

  /**
   * Try to acquire the lock. Returns false if already locked.
   * This is synchronous — no interleaving possible in Node.js event loop.
   */
  acquire(): boolean {
    if (this.locked) {
      log.info(`[${this.name}] Lock held — rejecting duplicate start`)
      return false
    }
    this.locked = true
    return true
  }

  /**
   * Release the lock. Called in stop() or on failure.
   */
  release(): void {
    this.locked = false
  }

  /**
   * Check if the lock is currently held.
   */
  isLocked(): boolean {
    return this.locked
  }
}

/**
 * Validate whether a PID is still alive.
 * Returns true if the process exists, false if it's gone.
 */
export const isProcessAlive = (pid: number | null): boolean => {
  if (!pid) return false
  try {
    process.kill(pid, 0) // signal 0 = existence check, no actual signal sent
    return true
  } catch {
    return false
  }
}
