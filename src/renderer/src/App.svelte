<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { appInfo, config, connections, serverInfo, appState } from './lib/stores'

  import Main from './lib/components/Main.svelte'

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
    connections.set(await api.getConnections())

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

    api.onData((data: any) => {
      if (data.type === 'status:server') {
        serverInfo.update((info) => ({ ...info, status: data.data }))
      }
      if (data.type === 'server:ready') {
        serverInfo.update((info) => ({ ...info, reachable: true, url: data.data?.url }))
      }
    })

    // Don't auto-install anything — the user must explicitly choose
    // "Get Started" (local install) which handles Python/uv as a prerequisite.
    appState.set('ready')

    setInterval(async () => {
      serverInfo.set(await api.getServerInfo())
    }, 3000)
  })

  onDestroy(() => {
    if (themeMediaQuery && themeChangeHandler) {
      themeMediaQuery.removeEventListener('change', themeChangeHandler)
    }
  })
</script>

<main class="w-full h-full bg-[#f5f5f7] dark:bg-[#0a0a0a]">
  <Main />
</main>
