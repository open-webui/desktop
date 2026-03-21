<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { connections, config, serverInfo, appState } from '../../stores'
  import i18n from '../../i18n'

  import Sidebar from './Connections/Sidebar.svelte'
  import Content from './Connections/Content.svelte'
  import StatusBar from './Connections/StatusBar.svelte'
  import LogPanel from './Connections/LogPanel.svelte'

  interface Props {
    onOpenSettings: () => void
    sidebarOpen: boolean
    activeConnectionName?: string
  }

  let {
    onOpenSettings,
    sidebarOpen,
    activeConnectionName = $bindable('')
  }: Props = $props()

  let isLocalConnection = $state(false)
  let showingLogs = $state(false)

  let url = $state('')
  let connecting = $state(false)
  let error = $state('')
  let view = $state('welcome') // welcome | add | install | connected
  let autoInstall = $state(false)
  let installPhase = $state('idle') // idle | working | error
  let installError = $state('')
  let toastVisible = $state(false)
  let toastTimeout: ReturnType<typeof setTimeout> | null = null
  let installStatus = $state('')
  let settingsOpen = $state(false)
  let connectedUrl = $state('')
  let activeConnectionId = $state('')
  let connectingId = $state('')
  let openConnections: Map<string, string> = $state(new Map())
  let localInstalled = $state(false)

  // Active log panel
  let activeLog = $state<'server' | 'open-terminal' | 'llama-server' | null>(null)

  const serverStatus = $derived($serverInfo?.status)
  const serverReachable = $derived($serverInfo?.reachable)

  const isInitializing = $derived($appState === 'initializing')
  const hasLocal = $derived(($connections ?? []).some((c) => c.type === 'local'))
  const localConn = $derived(($connections ?? []).find((c) => c.type === 'local'))
  const remoteConnections = $derived(($connections ?? []).filter((c) => c.type !== 'local'))

  // Open Terminal state
  let openTerminalStatus = $state<string | null>(null)
  let openTerminalInfo = $state<{ url?: string; apiKey?: string } | null>(null)

  // Llama Server state
  let llamaCppStatus = $state<string | null>(null)
  let llamaCppInfo = $state<{ url?: string; pid?: number } | null>(null)
  let llamaCppSetupStatus = $state('')

  const startInstall = async (options?: { installOpenTerminal?: boolean; installLlamaCpp?: boolean }) => {
    installPhase = 'working'
    installError = ''
    installStatus = ''
    toastVisible = false
    try {
      // Check disk space before installing (minimum 5 GB)
      const MINIMUM_DISK_BYTES = 5 * 1024 * 1024 * 1024
      const disk = await window.electronAPI.getDiskSpace()
      if (disk?.free >= 0 && disk.free < MINIMUM_DISK_BYTES) {
        const availableGB = (disk.free / (1024 * 1024 * 1024)).toFixed(1)
        throw new Error(`Not enough disk space. At least 5 GB is required (${availableGB} GB available).`)
      }

      // Ensure Python and uv are installed before attempting package install
      const pythonReady = await window.electronAPI.getPythonStatus()
      if (!pythonReady) {
        const pythonOk = await window.electronAPI.installPython()
        if (!pythonOk) throw new Error('Failed to install Python. Please try again.')
      }

      // Start optional services in parallel — they don't depend on Open WebUI
      if (options?.installOpenTerminal) {
        toggleOpenTerminal()
      }
      if (options?.installLlamaCpp) {
        toggleLlamaCpp()
      }

      const ok = await window.electronAPI.installPackage()
      if (!ok) throw new Error($i18n.t('error.installFailedGeneric'))

      installStatus = $i18n.t('main.install.startingServer')
      await window.electronAPI.startServer()
      const info = await window.electronAPI.getServerInfo()

      installStatus = $i18n.t('main.install.settingUpConnection')
      await window.electronAPI.addConnection({
        id: 'local',
        name: 'Local',
        type: 'local',
        url: info?.url || 'http://127.0.0.1:8080'
      })
      await window.electronAPI.setDefaultConnection('local')
      connections.set(await window.electronAPI.getConnections())
      config.set(await window.electronAPI.getConfig())

      // Wait for server to actually be reachable before showing connected view
      installStatus = $i18n.t('main.install.launchingOpenWebUI')
      const maxWait = 120000
      const pollInterval = 2000
      const startTime = Date.now()
      while (Date.now() - startTime < maxWait) {
        const si = await window.electronAPI.getServerInfo()
        if (si?.reachable) break
        await new Promise((r) => setTimeout(r, pollInterval))
      }

      // Now connect — the server is ready
      installStatus = ''
      installPhase = 'idle'
      localInstalled = true
      await connect('local')
    } catch (e: any) {
      installPhase = 'error'
      installError = e?.message || $i18n.t('error.somethingWentWrong')
      toastVisible = true
      if (toastTimeout) clearTimeout(toastTimeout)
      toastTimeout = setTimeout(() => { toastVisible = false }, 5000)
    }
  }

  const addConnection = async () => {
    if (!url.trim()) return
    let u = url.trim()
    if (!u.startsWith('http')) u = 'https://' + u
    error = ''
    connecting = true
    try {
      const valid = await window.electronAPI.validateUrl(u)
      if (!valid) {
        error = $i18n.t('setup.couldNotReachServer')
        connecting = false
        return
      }
      await window.electronAPI.addConnection({
        id: crypto.randomUUID(),
        name: new URL(u).hostname,
        type: 'remote',
        url: u
      })
      connections.set(await window.electronAPI.getConnections())
      config.set(await window.electronAPI.getConfig())
      url = ''
      error = ''
      view = 'welcome'
    } catch {
      error = $i18n.t('setup.connectionFailed')
    } finally {
      connecting = false
    }
  }

  const connect = async (id: string) => {
    showingLogs = false
    // Toggle: clicking the active connection unselects it
    if (activeConnectionId === id && view === 'connected') {
      activeConnectionId = ''
      connectedUrl = ''
      view = 'welcome'
      return
    }
    if (openConnections.has(id)) {
      activeConnectionId = id
      connectedUrl = openConnections.get(id)!
      view = 'connected'
      return
    }
    connectingId = id
    try {
      const result = await window.electronAPI.connectTo(id)
      if (result?.url) {
        openConnections.set(result.connectionId, result.url)
        openConnections = new Map(openConnections) // trigger reactivity
        connectedUrl = result.url
        activeConnectionId = result.connectionId
        view = 'connected'
      }
    } finally {
      connectingId = ''
    }
  }

  const disconnect = () => {
    activeConnectionId = ''
    connectedUrl = ''
    view = 'welcome'
  }

  const remove = async (id: string) => {
    await window.electronAPI.removeConnection(id)
    connections.set(await window.electronAPI.getConnections())
    config.set(await window.electronAPI.getConfig())
    if (activeConnectionId === id) {
      disconnect()
    }
    openConnections.delete(id)
    openConnections = new Map(openConnections)
  }

  // Sync active connection info to parent
  $effect(() => {
    const conn = ($connections ?? []).find((c) => c.id === activeConnectionId)
    activeConnectionName = conn?.name ?? ''
    isLocalConnection = conn?.type === 'local'
  })

  // React to showingLogs from parent — open the server log panel
  // Only react when parent sets showingLogs to true; don't close on false
  // (the status bar manages its own open/close via activeLog)
  $effect(() => {
    if (showingLogs) {
      activeLog = 'server'
    }
  })

  // Sync back: when panel closes, tell parent
  $effect(() => {
    if (activeLog === null) {
      showingLogs = false
    }
  })

  const openGithub = () => {
    settingsOpen = false
    window.electronAPI?.openInBrowser?.('https://github.com/open-webui/desktop')
  }

  // ── Log panel PTY helpers ─────────────────────────────
  const getConnectPty = (log: string) => {
    return (callback: (data: string) => void) => {
      if (log === 'server') {
        window.electronAPI.connectPty(callback)
      } else if (log === 'open-terminal') {
        window.electronAPI.connectOpenTerminalPty(callback)
      } else if (log === 'llama-server') {
        window.electronAPI.connectLlamaCppPty(callback)
      }
    }
  }

  const getDisconnectPty = (log: string) => {
    return () => {
      if (log === 'server') {
        window.electronAPI.disconnectPty()
      } else if (log === 'open-terminal') {
        window.electronAPI?.disconnectOpenTerminalPty?.()
      } else if (log === 'llama-server') {
        window.electronAPI?.disconnectLlamaCppPty?.()
      }
    }
  }

  const getOnWrite = (log: string) => {
    if (log === 'server') {
      return (data: string) => window.electronAPI.writePty(data)
    }
    return undefined
  }

  const getOnResize = (log: string) => {
    if (log === 'server') {
      return (cols: number, rows: number) => window.electronAPI.resizePty(cols, rows)
    }
    return undefined
  }

  // ── Status bar log selection ──────────────────────────
  const selectLog = (log: string) => {
    activeLog = activeLog === log ? null : (log as typeof activeLog)
  }

  // Listen for events from main process
  onMount(() => {
    window.electronAPI.onData((data: any) => {
      if (data.type === 'connection:open' && data.data?.url) {
        const connId = data.data.connectionId ?? ''
        openConnections.set(connId, data.data.url)
        openConnections = new Map(openConnections)
        connectedUrl = data.data.url
        activeConnectionId = connId
        view = 'connected'
      }
      if (data.type === 'status:open-terminal') {
        openTerminalStatus = data.data
      }
      if (data.type === 'open-terminal:ready') {
        openTerminalInfo = data.data
        openTerminalStatus = 'started'
      }
      if (data.type === 'status:llamacpp') {
        llamaCppStatus = data.data
      }
      if (data.type === 'status:llamacpp-setup') {
        llamaCppSetupStatus = data.data ?? ''
      }
      if (data.type === 'llamacpp:ready') {
        llamaCppInfo = data.data
        llamaCppStatus = 'started'
        llamaCppSetupStatus = ''
      }
      if (data.type === 'status:install') {
        installStatus = data.data ?? ''
      }
    })

    // Check current Open Terminal state on mount
    window.electronAPI.getOpenTerminalInfo().then((info: any) => {
      if (info?.status) {
        openTerminalStatus = info.status
        openTerminalInfo = info
      }
    })

    // Check if Open WebUI package is installed
    window.electronAPI.getPackageVersion('open-webui').then((v: string | null) => {
      localInstalled = v !== null
    })

    // Check llama-server state on mount
    window.electronAPI.getLlamaCppInfo().then((info: any) => {
      if (info?.status) {
        llamaCppStatus = info.status
        llamaCppInfo = info
      }
    })
  })

  const toggleOpenTerminal = async () => {
    if (openTerminalStatus === 'starting') return
    if (openTerminalStatus === 'started') {
      openTerminalStatus = 'stopping'
      await window.electronAPI.stopOpenTerminal()
      openTerminalStatus = null
      openTerminalInfo = null
    } else {
      openTerminalStatus = 'starting'
      const result = await window.electronAPI.startOpenTerminal()
      if (result) {
        openTerminalInfo = result
        openTerminalStatus = 'started'
      } else {
        openTerminalStatus = 'failed'
      }
    }
  }

  const toggleLlamaCpp = async () => {
    if (llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up') return
    if (llamaCppStatus === 'started') {
      llamaCppStatus = 'stopping'
      await window.electronAPI.stopLlamaCpp()
      llamaCppStatus = null
      llamaCppInfo = null
    } else {
      llamaCppStatus = 'starting'
      const result = await window.electronAPI.startLlamaCpp()
      if (result) {
        llamaCppInfo = result
        llamaCppStatus = 'started'
      } else {
        llamaCppStatus = 'failed'
      }
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-full w-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]" in:fade={{ duration: 200 }}>
  <div class="flex-1 min-h-0 flex">
    {#if sidebarOpen}
      <Sidebar
        {activeConnectionId}
        {connectingId}
        {localConn}
        {localInstalled}
        {remoteConnections}
        {serverStatus}
        {serverReachable}
        bind:settingsOpen
        onConnect={connect}
        onDisconnect={disconnect}
        onAddView={() => { disconnect(); view = 'add' }}
        {onOpenSettings}
        onRename={async (id, name) => {
          await window.electronAPI.updateConnection(id, { name })
          connections.set(await window.electronAPI.getConnections())
        }}
        onRemove={remove}
        {openGithub}
      />
    {/if}

    <Content
      {sidebarOpen}
      bind:view
      {activeConnectionId}
      {connectingId}
      {openConnections}
      {localConn}
      {localInstalled}
      {remoteConnections}
      bind:installPhase
      bind:installError
      bind:installStatus
      bind:toastVisible
      bind:url
      bind:connecting
      bind:error
      bind:autoInstall
      onStartInstall={startInstall}
      onAddConnection={addConnection}
      onSetView={(v) => { view = v }}
    />
  </div>

  {#if activeLog}
    <LogPanel
      {activeLog}
      serviceReady={activeLog === 'server'
        ? serverStatus === 'started'
        : activeLog === 'open-terminal'
          ? openTerminalStatus === 'started'
          : llamaCppStatus === 'started'}
      statusText={activeLog === 'server'
        ? (serverStatus === 'starting' ? 'Starting Open WebUI…' : serverStatus === 'running' && !serverReachable ? 'Waiting for server…' : installStatus || '')
        : activeLog === 'open-terminal'
          ? (openTerminalStatus === 'stopping' ? 'Stopping Open Terminal…' : openTerminalStatus === 'starting' ? 'Starting Open Terminal…' : '')
          : (llamaCppStatus === 'stopping' ? 'Stopping llama-server…' : llamaCppSetupStatus || (llamaCppStatus === 'starting' ? 'Starting llama-server…' : llamaCppStatus === 'setting-up' ? 'Setting up llama.cpp…' : ''))}
      connectPty={getConnectPty(activeLog)}
      disconnectPty={getDisconnectPty(activeLog)}
      readonly={activeLog !== 'server'}
      onWrite={getOnWrite(activeLog)}
      onResize={getOnResize(activeLog)}
      onStop={activeLog === 'open-terminal' ? toggleOpenTerminal : activeLog === 'llama-server' ? toggleLlamaCpp : undefined}
      onClose={() => { activeLog = null; showingLogs = false }}
    />
  {/if}

  <StatusBar
    {serverStatus}
    {serverReachable}
    {openTerminalStatus}
    {llamaCppStatus}
    {activeLog}
    onSelectLog={selectLog}
    onStartServer={async () => {
      if (!localInstalled) {
        // Not installed — trigger full install (handles Python/uv + package)
        startInstall()
        return
      }
      // Already installed — start the server
      await window.electronAPI.startServer()
      // Force-refresh serverInfo immediately (don't wait for 3s poll)
      const info = await window.electronAPI.getServerInfo()
      serverInfo.set(info)
    }}
    onToggleOpenTerminal={toggleOpenTerminal}
    onToggleLlamaCpp={toggleLlamaCpp}
  />
</div>
