import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isAllowedExternalUrl,
  isPathInside,
  normalizeOpenUrl
} from '../src/main/safe-open.ts'

test('isAllowedExternalUrl allows http(s)/mailto and rejects the rest', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/a'), true)
  assert.equal(isAllowedExternalUrl('http://127.0.0.1:8080'), true)
  assert.equal(isAllowedExternalUrl('mailto:a@b.c'), true)
  assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false)
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false)
  assert.equal(isAllowedExternalUrl('not a url'), false)
})

test('normalizeOpenUrl rewrites 0.0.0.0 to localhost', () => {
  assert.equal(normalizeOpenUrl('http://0.0.0.0:8080/ui'), 'http://localhost:8080/ui')
  assert.equal(normalizeOpenUrl('https://example.com'), 'https://example.com')
})

test('isPathInside confines targets to the given roots', () => {
  assert.equal(isPathInside('/data/models/a.gguf', ['/data/models']), true)
  assert.equal(isPathInside('/data/models', ['/data/models']), true)
  assert.equal(isPathInside('/data/models-evil/a', ['/data/models']), false)
  assert.equal(isPathInside('/etc/passwd', ['/data/models']), false)
})
