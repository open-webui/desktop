import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isGuestSendType,
  isGuestLoadPage,
  handleGuestSend,
  GUEST_SEND_TYPES
} from '../src/renderer/src/lib/guest-protocol.ts'

const api = {
  setAuthToken: async (token: string) => token,
  getAppInfo: async () => ({
    version: '0.0.20',
    platform: 'linux',
    arch: 'x64',
    username: 'secret-user'
  }),
  isWindowFocused: async () => ({ isFocused: true })
}

test('guest send allowlist is closed', () => {
  for (const type of GUEST_SEND_TYPES) {
    assert.equal(isGuestSendType(type), true)
  }
  assert.equal(isGuestSendType('resetApp'), false)
  assert.equal(isGuestSendType('setConfig'), false)
  assert.equal(isGuestLoadPage('settings'), true)
  assert.equal(isGuestLoadPage('drop-tables'), false)
})

test('handleGuestSend ignores unknown types and never returns config', async () => {
  assert.equal(await handleGuestSend({ type: 'resetApp' }, api), undefined)
  assert.equal(await handleGuestSend({ type: 'app:data' }, api), null)
})

test('app:info strips username', async () => {
  const info = await handleGuestSend({ type: 'app:info' }, api)
  assert.deepEqual(info, { version: '0.0.20', platform: 'linux', arch: 'x64' })
})

test('token:update only forwards a non-empty string', async () => {
  const seen: string[] = []
  const capturing = {
    ...api,
    setAuthToken: async (token: string) => {
      seen.push(token)
    }
  }
  await handleGuestSend({ type: 'token:update', token: 'abc' }, capturing)
  await handleGuestSend({ type: 'token:update', token: '' }, capturing)
  await handleGuestSend({ type: 'token:update', token: 1 }, capturing)
  assert.deepEqual(seen, ['abc'])
})
