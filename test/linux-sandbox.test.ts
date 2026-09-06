import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linuxNeedsNoSandbox } from '../src/main/linux-sandbox.ts'

test('unpackaged always needs no-sandbox', () => {
  assert.equal(linuxNeedsNoSandbox({}, false), true)
})

test('packaged native .deb/.rpm keeps the renderer sandbox', () => {
  assert.equal(linuxNeedsNoSandbox({}, true), false)
})

test('AppImage, snap, Flatpak, and explicit env opt in', () => {
  assert.equal(linuxNeedsNoSandbox({ APPIMAGE: '/tmp/app.AppImage' }, true), true)
  assert.equal(linuxNeedsNoSandbox({ SNAP: '/snap/owui' }, true), true)
  assert.equal(linuxNeedsNoSandbox({ FLATPAK_ID: 'com.openwebui.desktop' }, true), true)
  assert.equal(linuxNeedsNoSandbox({ ELECTRON_DISABLE_SANDBOX: '1' }, true), true)
})
