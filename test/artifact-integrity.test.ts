import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  parseGithubDigest,
  parseHfLfsSha256,
  sha256File,
  assertSha256,
  fileMatchesSha256,
  downloadAndVerifySha256
} from '../src/main/utils/artifact-integrity.ts'

const tmp = mkdtempSync(join(tmpdir(), 'owui-integrity-'))
after(() => {
  rmSync(tmp, { recursive: true, force: true })
})

test('parseGithubDigest accepts sha256:hex and rejects anything else', () => {
  const hex = 'a'.repeat(64)
  assert.equal(parseGithubDigest(`sha256:${hex}`), hex)
  assert.throws(() => parseGithubDigest(hex), /missing a sha256 digest/)
  assert.throws(() => parseGithubDigest('sha256:zz'), /Invalid GitHub asset digest/)
  assert.throws(() => parseGithubDigest('sha256:' + 'a'.repeat(63)), /Invalid/)
})

test('parseHfLfsSha256 uses lfs.sha256 only, never git oid', () => {
  const hex = '8ccc5cd1f1b3602548715ae25a66ed73fd5dc68a210412eea643eb20eb75a135'
  assert.equal(parseHfLfsSha256({ sha256: hex.toUpperCase() }), hex)
  assert.throws(() => parseHfLfsSha256(undefined), /missing LFS SHA-256/)
  assert.throws(() => parseHfLfsSha256({ oid: hex }), /missing LFS SHA-256/)
  assert.throws(() => parseHfLfsSha256({ sha256: 'abc' }), /missing LFS SHA-256/)
})

test('sha256File / assertSha256 / fileMatchesSha256', () => {
  const file = join(tmp, 'blob.bin')
  writeFileSync(file, 'hello-owui')
  const hex = createHash('sha256').update('hello-owui').digest('hex')
  assert.equal(sha256File(file), hex)
  assert.equal(fileMatchesSha256(file, hex), true)
  assert.equal(fileMatchesSha256(file, 'b'.repeat(64)), false)
  assert.doesNotThrow(() => assertSha256(file, hex))
  assert.throws(() => assertSha256(file, 'b'.repeat(64)), /Checksum mismatch/)
})

test('downloadAndVerifySha256 writes dest only when the digest matches', async () => {
  const payload = Buffer.from('verified-bytes')
  const hex = createHash('sha256').update(payload).digest('hex')
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-length': String(payload.length) })
    res.end(payload)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    const dest = join(tmp, 'ok.bin')
    await downloadAndVerifySha256(`http://127.0.0.1:${port}/file`, dest, hex)
    assert.equal(readFileSync(dest).toString(), 'verified-bytes')

    const bad = join(tmp, 'bad.bin')
    await assert.rejects(
      downloadAndVerifySha256(`http://127.0.0.1:${port}/file`, bad, 'c'.repeat(64)),
      /Checksum mismatch/
    )
    assert.equal(fileMatchesSha256(bad, hex), false)
  } finally {
    server.close()
  }
})
