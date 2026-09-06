import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  pickLatestLlamaCppRelease,
  releaseHasLlamaBinaries,
  type GithubRelease
} from '../src/main/utils/llama-release.ts'

const hashedBin: GithubRelease = {
  tag_name: 'b1234',
  assets: [
    {
      name: 'llama-b1234-bin-ubuntu-x64.tar.gz',
      browser_download_url: 'https://example.invalid/a',
      digest: 'sha256:' + 'a'.repeat(64)
    }
  ]
}

test('releaseHasLlamaBinaries requires hashed *-bin-* assets and skips drafts', () => {
  assert.equal(releaseHasLlamaBinaries(hashedBin), true)
  assert.equal(releaseHasLlamaBinaries({ tag_name: 'v0.4.0', assets: [] }), false)
  assert.equal(
    releaseHasLlamaBinaries({
      tag_name: 'b1',
      assets: [{ name: 'llama-b1-bin-x64.tar.gz', browser_download_url: 'x' }]
    }),
    false
  )
  assert.equal(releaseHasLlamaBinaries({ ...hashedBin, draft: true }), false)
})

test('pickLatestLlamaCppRelease skips a latest tag with no binaries', () => {
  const picked = pickLatestLlamaCppRelease([
    { tag_name: 'v0.4.0', assets: [] },
    hashedBin
  ])
  assert.equal(picked.tag_name, 'b1234')
  assert.throws(() => pickLatestLlamaCppRelease([{ tag_name: 'v0.4.0' }]), /No llama.cpp/)
})
