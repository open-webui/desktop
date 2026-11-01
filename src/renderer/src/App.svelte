<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { appInfo, config, serverInfo, appState, desktopUpdate } from './lib/stores'

  import Main from './lib/components/Main.svelte'

  let unsubscribe: (() => void) | undefined
  let themeMediaQuery: MediaQueryList
  let themeChangeHandler: ((e: MediaQueryListEvent) => void) | null = null

  const applyResolvedTheme = (theme: string) => {
    let resolved = theme
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolved)
  }

  onMount(async () => {
    const api = window?.electronAPI
    if (!api) return

    appInfo.set(await api.getAppInfo())
    config.set(await api.getConfig())

    // Apply saved theme
    const savedTheme = (await api.getConfig())?.theme ?? 'system'
    applyResolvedTheme(savedTheme)

    // Listen for OS theme changes so "system" mode reacts in real-time
    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    themeChangeHandler = () => {
      const currentTheme = $config?.theme ?? 'system'
      if (currentTheme === 'system') {
        applyResolvedTheme('system')
      }
    }
    themeMediaQuery.addEventListener('change', themeChangeHandler)

    let receivedUpdate = false
    unsubscribe = api.onData((data: any) => {
      if (data.type === 'server:info') serverInfo.set(data.data)
      if (data.type === 'update:state') {
        receivedUpdate = true
        desktopUpdate.set(data.data)
      }

    })

    // Update discovery must not delay server status or the rest of startup.
    api.getUpdateState().then((update) => {
      if (!receivedUpdate) desktopUpdate.set(update)
    }).catch((error) => {
      if (!receivedUpdate) desktopUpdate.set({ status: 'error', error: String(error) })
    })

    // Don't auto-install anything — the user must explicitly choose
    // "Get Started" (local install) which handles Python/uv as a prerequisite.
    appState.set('ready')

    serverInfo.set(await api.getServerInfo())
  })

  onDestroy(() => {
    unsubscribe?.()
    if (themeMediaQuery && themeChangeHandler) {
      themeMediaQuery.removeEventListener('change', themeChangeHandler)
    }
  })
</script>

<main class="w-full h-full bg-[#f5f5f7] dark:bg-[#0a0a0a]">
  <Main />
</main>
