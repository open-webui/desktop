import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertSafeRepo,
  assertSafeFilename,
  confinedModelPath,
  huggingfaceDownloadUrl,
  huggingfaceRepoApiUrl,
  repoSlug
} from '../src/main/utils/hf-paths.ts'

test('assertSafeRepo allowlists owner/name', () => {
  assert.equal(assertSafeRepo('ggml-org/gemma-3-1b-it-GGUF'), 'ggml-org/gemma-3-1b-it-GGUF')
  assert.throws(() => assertSafeRepo('../etc/passwd'), /Invalid Hugging Face repository id/)
  assert.throws(() => assertSafeRepo('no-slash'), /Invalid/)
})

test('assertSafeFilename is GGUF-only and rejects traversal', () => {
  assert.equal(assertSafeFilename('model.gguf'), 'model.gguf')
  assert.throws(() => assertSafeFilename('../model.gguf'), /Invalid model filename/)
  assert.throws(() => assertSafeFilename('/tmp/model.gguf'), /Invalid model filename/)
  assert.throws(() => assertSafeFilename('model.bin'), /Only GGUF/)
})

test('confinedModelPath stays under the cache root', () => {
  const dest = confinedModelPath('/tmp/models', 'org/name', 'w.gguf')
  assert.equal(dest, '/tmp/models/org--name/w.gguf')
  assert.equal(repoSlug('org/name'), 'org--name')
})

test('Hub URLs encode the repo and request blobs=true for LFS sha256', () => {
  const api = huggingfaceRepoApiUrl('ggml-org/gemma-3-1b-it-GGUF')
  assert.match(api, /huggingface\.co\/api\/models\/ggml-org\/gemma-3-1b-it-GGUF\?blobs=true$/)
  const dl = huggingfaceDownloadUrl('ggml-org/gemma-3-1b-it-GGUF', 'gemma.gguf')
  assert.equal(
    dl,
    'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma.gguf'
  )
})
