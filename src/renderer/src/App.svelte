<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { appInfo, config, connections, serverInfo, appState } from './lib/stores'

  import Main from './lib/components/Main.svelte'

  onMount(async () => {
    const api = window?.electronAPI
    if (!api) return

    appInfo.set(await api.getAppInfo())
    config.set(await api.getConfig())
    connections.set(await api.getConnections())

    api.onData((data: any) => {
      if (data.type === 'status:server') {
        serverInfo.update((info) => ({ ...info, status: data.data }))
      }
      if (data.type === 'server:ready') {
        serverInfo.update((info) => ({ ...info, reachable: true, url: data.data?.url }))
      }
    })

    // Install python in the background — don't block UI
    const pythonReady = await api.getPythonStatus()
    if (!pythonReady) {
      appState.set('initializing')
      api.installPython().then(async () => {
        appState.set('ready')
      })
    } else {
      appState.set('ready')
    }

    setInterval(async () => {
      serverInfo.set(await api.getServerInfo())
    }, 3000)
  })
</script>

<main class="w-full h-full bg-[#0a0a0a]">
  <Main />
</main>
