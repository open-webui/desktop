import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isBlockedEnvKey,
  sanitizeChildEnv,
  sanitizeLlamaExtraArgs
} from '../src/main/utils/child-env.ts'

test('isBlockedEnvKey is case-insensitive', () => {
  assert.equal(isBlockedEnvKey('LD_PRELOAD'), true)
  assert.equal(isBlockedEnvKey('ld_preload'), true)
  assert.equal(isBlockedEnvKey('NODE_OPTIONS'), true)
  assert.equal(isBlockedEnvKey('PYTHONHOME'), true)
  assert.equal(isBlockedEnvKey('LD_LIBRARY_PATH'), false)
  assert.equal(isBlockedEnvKey('PATH'), false)
})

test('sanitizeChildEnv drops blocked keys from base and extra', () => {
  const out = sanitizeChildEnv(
    { NODE_OPTIONS: '--require evil', KEEP: 'yes' },
    { PATH: '/bin', LD_PRELOAD: '/tmp/x.so', KEEP_BASE: '1' }
  )
  assert.equal(out.PATH, '/bin')
  assert.equal(out.KEEP, 'yes')
  assert.equal(out.KEEP_BASE, '1')
  assert.equal('LD_PRELOAD' in out, false)
  assert.equal('NODE_OPTIONS' in out, false)
})

test('sanitizeLlamaExtraArgs strips host/port/models-dir including attached values', () => {
  assert.deepEqual(
    sanitizeLlamaExtraArgs([
      '--n-gpu-layers',
      '20',
      '--host',
      '0.0.0.0',
      '--port=8080',
      '--models-dir',
      '/tmp',
      '--ctx-size',
      '4096'
    ]),
    ['--n-gpu-layers', '20', '--ctx-size', '4096']
  )
  assert.deepEqual(sanitizeLlamaExtraArgs('nope'), [])
  assert.deepEqual(sanitizeLlamaExtraArgs([1, '', '--ok'] as unknown[]), ['--ok'])
})
