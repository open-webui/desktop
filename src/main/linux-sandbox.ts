/**
 * Chromium's SUID sandbox cannot be set up inside AppImage/snap/Flatpak,
 * and unpackaged `electron` binaries ship chrome-sandbox without the
 * setuid bit. Native .deb/.rpm installs can keep the renderer sandbox.
 */
export function linuxNeedsNoSandbox(
  env: NodeJS.ProcessEnv = process.env,
  packaged = true
): boolean {
  if (!packaged) return true
  return Boolean(
    env.APPIMAGE ||
      env.SNAP ||
      env.FLATPAK_ID ||
      env.ELECTRON_DISABLE_SANDBOX === '1'
  )
}
