import assert from 'node:assert/strict'
import { test } from 'node:test'
import pty from 'node-pty'
import { safePtyResize, safePtyWrite } from '../src/main/utils/safe-pty.ts'

test('safePtyResize swallows the Windows "already exited" error', () => {
  const fake = {
    resize: () => {
      throw new Error('Cannot resize a pty that has already exited')
    }
  }
  assert.equal(safePtyResize(fake, 80, 24), false)
})

test('safePtyResize swallows Linux ioctl EBADF after exit', () => {
  const fake = {
    resize: () => {
      throw new Error('ioctl(2) failed, EBADF')
    }
  }
  assert.equal(safePtyResize(fake, 120, 40), false)
})

test('safePtyResize returns true when the PTY is alive', () => {
  const calls: [number, number][] = []
  const fake = {
    resize: (cols: number, rows: number) => {
      calls.push([cols, rows])
    }
  }
  assert.equal(safePtyResize(fake, 80, 24), true)
  assert.deepEqual(calls, [[80, 24]])
})

test('safePtyWrite swallows throws after exit', () => {
  const fake = {
    write: () => {
      throw new Error('Cannot write to a pty that has already exited')
    }
  }
  assert.equal(safePtyWrite(fake, 'x'), false)
})

test('live node-pty: resize after exit does not throw out of the helper', async () => {
  const child = pty.spawn('sh', ['-c', 'exit 0'], { name: 'xterm', cols: 80, rows: 24 })
  await new Promise<void>((resolve) => {
    child.onExit(() => resolve())
  })
  assert.doesNotThrow(() => safePtyResize(child, 100, 30))
  assert.equal(safePtyResize(child, 100, 30), false)
  assert.doesNotThrow(() => safePtyWrite(child, 'x'))
})
