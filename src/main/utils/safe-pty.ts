/**
 * node-pty throws from the main process if resize/write runs after the
 * child has exited (Windows: "already exited"; Linux: ioctl EBADF).
 * That exception is uncaught and kills the whole Electron app (#255).
 */

export function safePtyResize(
  pty: { resize: (cols: number, rows: number) => void },
  cols: number,
  rows: number
): boolean {
  try {
    pty.resize(cols, rows)
    return true
  } catch {
    return false
  }
}

export function safePtyWrite(pty: { write: (data: string) => void }, data: string): boolean {
  try {
    pty.write(data)
    return true
  } catch {
    return false
  }
}
