const { execSync } = require('child_process')
const path = require('path')

/**
 * electron-builder afterSign hook.
 *
 * On macOS, electron-builder's ad-hoc signing can leave the Electron Framework
 * with a Team ID that differs from the main executable's, which causes dyld to
 * refuse loading it ("mapping process and mapped file (non-platform) have
 * different Team IDs"). This is especially common on macOS 26+.
 *
 * We fix this by force-re-signing the entire app bundle with a consistent
 * ad-hoc signature.
 */
exports.default = async function afterSign(context) {
  if (process.platform !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  console.log(`  • re-signing (adhoc)  file=${appPath}`)

  execSync(`codesign --force --deep --sign - "${appPath}"`, {
    stdio: 'inherit'
  })

  console.log('  • re-signing complete')
}
