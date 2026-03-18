<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { connections, config, serverInfo, appState } from '../../stores'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'

  import Sidebar from './Connections/Sidebar.svelte'
  import Content from './Connections/Content.svelte'

  interface Props {
    onOpenSettings: () => void
    sidebarOpen: boolean
    activeConnectionName?: string
    isLocalConnection?: boolean
    showingLogs?: boolean
  }

  let {
    onOpenSettings,
    sidebarOpen,
    activeConnectionName = $bindable(''),
    isLocalConnection = $bindable(false),
    showingLogs = $bindable(false)
  }: Props = $props()

  let url = $state('')
  let connecting = $state(false)
  let error = $state('')
  let view = $state('welcome') // welcome | add | install | logs | connected | open-terminal-logs
  let autoInstall = $state(false)
  let installPhase = $state('idle') // idle | working | error
  let installError = $state('')
  let toastVisible = $state(false)
  let toastTimeout: ReturnType<typeof setTimeout> | null = null
  let installStatus = $state('')
  let settingsOpen = $state(false)
  let connectedUrl = $state('')
  let activeConnectionId = $state('')
  let openConnections: Map<string, string> = $state(new Map())
  let localInstalled = $state(false)

  // Terminal state (server logs)
  let terminalEl: HTMLDivElement | undefined = $state()
  let term: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null

  // Open Terminal log viewer
  let otTerminalEl: HTMLDivElement | undefined = $state()
  let otTerm: Terminal | null = null
  let otFitAddon: FitAddon | null = null
  let otResizeObserver: ResizeObserver | null = null

  const serverStatus = $derived($serverInfo?.status)
  const serverReachable = $derived($serverInfo?.reachable)

  const isInitializing = $derived($appState === 'initializing')
  const hasLocal = $derived(($connections ?? []).some((c) => c.type === 'local'))
  const localConn = $derived(($connections ?? []).find((c) => c.type === 'local'))
  const remoteConnections = $derived(($connections ?? []).filter((c) => c.type !== 'local'))

  // Open Terminal state
  let openTerminalStatus = $state<string | null>(null)
  let openTerminalInfo = $state<{ url?: string; apiKey?: string } | null>(null)

  const startInstall = async () => {
    installPhase = 'working'
    installError = ''
    installStatus = ''
    toastVisible = false
    try {
      const ok = await window.electronAPI.installPackage()
      if (!ok) throw new Error('Install failed')

      installStatus = 'Starting server…'
      await window.electronAPI.startServer()
      const info = await window.electronAPI.getServerInfo()

      installStatus = 'Setting up connection…'
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
      installStatus = 'Launching Open WebUI…'
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
      installError = e?.message || 'Something went wrong'
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
        error = 'Could not reach this server'
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
      error = 'Connection failed'
    } finally {
      connecting = false
    }
  }

  const connect = async (id: string) => {
    destroyTerminal()
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
    const result = await window.electronAPI.connectTo(id)
    if (result?.url) {
      openConnections.set(result.connectionId, result.url)
      openConnections = new Map(openConnections) // trigger reactivity
      connectedUrl = result.url
      activeConnectionId = result.connectionId
      view = 'connected'
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

  const showLogs = () => {
    view = 'logs'
  }

  // Sync active connection info to parent
  $effect(() => {
    const conn = ($connections ?? []).find((c) => c.id === activeConnectionId)
    activeConnectionName = conn?.name ?? ''
    isLocalConnection = conn?.type === 'local'
  })

  // React to showingLogs from parent
  $effect(() => {
    if (showingLogs) {
      view = 'logs'
      initTerminal()
    } else if (view === 'logs') {
      destroyTerminal()
      if (activeConnectionId) {
        view = 'connected'
      } else {
        view = 'welcome'
      }
    }
  })

  const openGithub = () => {
    settingsOpen = false
    window.electronAPI?.openInBrowser?.('https://github.com/open-webui/desktop')
  }

  // ── Terminal ──────────────────────────────────────────
  const initTerminal = () => {
    if (!terminalEl || term) return

    term = new Terminal({
      cursorBlink: false,
      disableStdin: false,
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      lineHeight: 1.5,
      scrollback: 10000,
      theme: {
        background: '#0a0a0a',
        foreground: '#a0a0a0',
        cursor: 'transparent',
        selectionBackground: '#ffffff30'
      },
      convertEol: true
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalEl)
    requestAnimationFrame(() => fitAddon?.fit())

    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
      if (term) {
        window.electronAPI.resizePty(term.cols, term.rows)
      }
    })
    resizeObserver.observe(terminalEl)

    term.onData((data: string) => {
      window.electronAPI.writePty(data)
    })

    window.electronAPI.connectPty((data: string) => {
      term?.write(data)
    })

    if (term) {
      window.electronAPI.resizePty(term.cols, term.rows)
    }
  }

  const destroyTerminal = () => {
    resizeObserver?.disconnect()
    resizeObserver = null
    window.electronAPI.disconnectPty()
    term?.dispose()
    term = null
    fitAddon = null
  }

  // ── Open Terminal Log Viewer ─────────────────────────
  const initOtTerminal = () => {
    if (!otTerminalEl || otTerm) return

    otTerm = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78'
      },
      convertEol: true,
      scrollback: 5000
    })
    otFitAddon = new FitAddon()
    otTerm.loadAddon(otFitAddon)
    otTerm.open(otTerminalEl)
    otFitAddon.fit()

    window.electronAPI.connectOpenTerminalPty((data: string) => {
      otTerm?.write(data)
    })

    otResizeObserver = new ResizeObserver(() => {
      try { otFitAddon?.fit() } catch {}
    })
    otResizeObserver.observe(otTerminalEl)
  }

  const destroyOtTerminal = () => {
    window.electronAPI?.disconnectOpenTerminalPty?.()
    otResizeObserver?.disconnect()
    otResizeObserver = null
    otTerm?.dispose()
    otTerm = null
    otFitAddon = null
  }

  onDestroy(() => {
    destroyTerminal()
    destroyOtTerminal()
  })

  // Init/destroy OT terminal when switching views
  $effect(() => {
    if (view === 'open-terminal-logs' && otTerminalEl) {
      initOtTerminal()
    } else if (view !== 'open-terminal-logs') {
      destroyOtTerminal()
    }
  })

  $effect(() => {
    if (view === 'logs' && terminalEl) {
      initTerminal()
    } else if (view !== 'logs' && view !== 'open-terminal-logs') {
      destroyTerminal()
    }
  })

  // Listen for connection:open from main process (auto-connect on launch)
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

  const toggleOtLogs = () => {
    view = view === 'open-terminal-logs' ? (activeConnectionId ? 'connected' : 'welcome') : 'open-terminal-logs'
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-full w-full flex bg-[#0a0a0a] text-[#fafafa]" in:fade={{ duration: 200 }}>
  {#if sidebarOpen}
    <Sidebar
      {activeConnectionId}
      {localConn}
      {localInstalled}
      {remoteConnections}
      {serverStatus}
      {serverReachable}
      {openTerminalStatus}
      bind:settingsOpen
      {view}
      onConnect={connect}
      onDisconnect={disconnect}
      onAddView={() => { disconnect(); view = 'add' }}
      {onOpenSettings}
      onToggleOpenTerminal={toggleOpenTerminal}
      onToggleOtLogs={toggleOtLogs}
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
    bind:terminalEl
    bind:otTerminalEl
    onStartInstall={startInstall}
    onAddConnection={addConnection}
    onSetView={(v) => { view = v }}
    onCopyLogs={(type) => {
      const t = type === 'server' ? term : otTerm
      if (!t) return null
      const buf = t.buffer.active
      const lines: string[] = []
      for (let i = 0; i < buf.length; i++) {
        lines.push(buf.getLine(i)?.translateToString(true) ?? '')
      }
      return lines.join('\n').trimEnd()
    }}
  />
</div>
