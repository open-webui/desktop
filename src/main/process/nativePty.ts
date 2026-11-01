import * as pty from 'node-pty'
import { execFile } from 'node:child_process'
import type { PtyProcess, ServiceLaunch } from './managedService'

export function spawnPty(launch: ServiceLaunch): PtyProcess {
  const child = pty.spawn(launch.file, launch.args, {
    name: 'xterm-256color',
    cols: 200,
    rows: 50,
    env: launch.env
  })
  return {
    pid: child.pid,
    onData: (callback) => child.onData(callback),
    onExit: (callback) =>
      child.onExit((exit) => {
        // The PTY leader can exit before its descendants. Retire the whole session.
        if (process.platform !== 'win32') {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            /* The group may already be gone. */
          }
        }
        callback(exit)
      }),
    write: (data) => child.write(data),
    resize: (cols, rows) => child.resize(cols, rows),
    kill: async (force): Promise<void> => {
      if (process.platform === 'win32') {
        return new Promise<void>((resolve, reject) => {
          execFile(
            'taskkill',
            ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])],
            { windowsHide: true, timeout: 2000 },
            (error) => {
              if (!error) return resolve()
              try {
                process.kill(child.pid, 0)
                reject(error)
              } catch {
                resolve()
              }
            }
          )
        })
      }
      const signal = force ? 'SIGKILL' : 'SIGTERM'
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        try {
          process.kill(child.pid, signal)
        } catch (fallback) {
          if ((fallback as NodeJS.ErrnoException).code !== 'ESRCH') throw fallback
        }
      }
    }
  }
}
