/**
 * Environment keys that must never reach Open WebUI / Open Terminal / llama-server
 * child processes. Matching is case-insensitive (Windows env is).
 *
 * LD_LIBRARY_PATH is intentionally allowed — CUDA/ROCm llama.cpp builds need it.
 */
const BLOCKED_ENV = new Set([
  'LD_PRELOAD',
  'LD_AUDIT',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_FORCE_FLAT_NAMESPACE',
  'NODE_OPTIONS',
  'NODE_PATH',
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR',
  'PYTHONINSPECT',
  'PYTHONSTARTUP',
  'PYTHONHOME'
])

const STRIPPED_LLAMA_FLAGS = new Set(['--host', '--port', '--models-dir'])

export function isBlockedEnvKey(name: string): boolean {
  return BLOCKED_ENV.has(name.toUpperCase())
}

export function sanitizeChildEnv(
  extra: Record<string, string | undefined> = {},
  base: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value == null || isBlockedEnvKey(key)) continue
    out[key] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value == null || isBlockedEnvKey(key)) continue
    out[key] = value
  }
  return out
}

/**
 * Drop flags that would override bind address, port, or models directory.
 * `--host` / `--port` / `--models-dir` are always supplied by the desktop.
 */
export function sanitizeLlamaExtraArgs(extraArgs: unknown): string[] {
  if (!Array.isArray(extraArgs)) return []
  const out: string[] = []
  for (let i = 0; i < extraArgs.length; i++) {
    const arg = extraArgs[i]
    if (typeof arg !== 'string' || arg.length === 0) continue
    const eq = arg.indexOf('=')
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    if (STRIPPED_LLAMA_FLAGS.has(flag)) {
      if (eq === -1) i++
      continue
    }
    out.push(arg)
  }
  return out
}
