<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { connections, config, appInfo, serverInfo, appState } from '../../stores'
  import LocalInstall from '../LocalInstall.svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'

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
  let view = $state('welcome') // welcome | add | install | logs
  let settingsOpen = $state(false)
  let connectedUrl = $state('')
  let activeConnectionId = $state('')
  let openConnections: Map<string, string> = $state(new Map())

  // Terminal state
  let terminalEl: HTMLDivElement | undefined = $state()
  let term: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null

  const serverStatus = $derived($serverInfo?.status)
  const serverReachable = $derived($serverInfo?.reachable)

  const isInitializing = $derived($appState === 'initializing')
  const hasLocal = $derived(($connections ?? []).some((c) => c.type === 'local'))

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

    // Keyboard input → PTY
    term.onData((data: string) => {
      window.electronAPI.writePty(data)
    })

    // Connect to PTY — output comes via callback
    window.electronAPI.connectPty((data: string) => {
      term?.write(data)
    })

    // Send initial resize
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

  onDestroy(() => {
    destroyTerminal()
  })

  // Init/destroy terminal when switching to/from logs view
  $effect(() => {
    if (view === 'logs' && terminalEl) {
      initTerminal()
    } else if (view !== 'logs') {
      destroyTerminal()
    }
  })

  // Listen for connection:open from main process (auto-connect on launch)
  onMount(() => {
    window.electronAPI.onData((data: any) => {
      if (data.type === 'connection:open' && data.url) {
        const connId = data.connectionId ?? ''
        openConnections.set(connId, data.url)
        openConnections = new Map(openConnections)
        connectedUrl = data.url
        activeConnectionId = connId
        view = 'connected'
      }
    })
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="h-full w-full flex bg-[#0a0a0a] text-[#fafafa]" in:fade={{ duration: 200 }}>
  <!-- Sidebar -->
  {#if sidebarOpen}
    <div
      class="w-[200px] shrink-0 flex flex-col bg-[#0a0a0a] relative"
      in:fly={{ x: -200, duration: 200 }}
    >
      <!-- Connections header -->
      <div class="flex items-center justify-between px-4 pt-2 pb-1.5">
        <span class="text-[10px] tracking-wider uppercase opacity-25">Connections</span>
        <button
          class="opacity-25 hover:opacity-60 transition bg-transparent border-none text-[#fafafa] leading-none"
          onclick={() => {
            disconnect()
            view = 'add'
          }}
          title="Add connection"
        >
          <svg
            class="w-[14px] h-[14px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <!-- Connection list -->
      <div class="flex-1 min-h-0 overflow-y-auto px-2">
        {#each $connections as conn (conn.id)}
          <div
            class="w-full px-2 py-[6px] rounded-xl cursor-pointer group flex items-center gap-2 transition-colors {activeConnectionId ===
            conn.id
              ? 'bg-white/[0.08]'
              : 'hover:bg-white/[0.05]'}"
            role="button"
            tabindex="0"
            onclick={() => connect(conn.id)}
            onkeydown={(e) => e.key === 'Enter' && connect(conn.id)}
          >
            <!-- Status indicator for local connections -->
            {#if conn.type === 'local'}
              {#if serverStatus === 'starting'}
                <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
                  <div
                    class="w-2.5 h-2.5 rounded-full border-2 border-amber-400/60 border-t-transparent animate-spin"
                  ></div>
                </div>
              {:else if serverReachable}
                <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
                  <div
                    class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  ></div>
                </div>
              {:else}
                <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
                  <div class="w-2 h-2 rounded-full bg-white/15"></div>
                </div>
              {/if}
            {:else}
              <svg
                class="w-[14px] h-[14px] shrink-0 opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                />
              </svg>
            {/if}
            <span
              class="text-[12px] {activeConnectionId === conn.id
                ? 'opacity-90'
                : 'opacity-50 group-hover:opacity-90'} transition-opacity truncate"
              >{conn.name}</span
            >

            <button
              class="ml-auto opacity-0 group-hover:opacity-30 hover:!opacity-70 transition bg-transparent border-none text-[#fafafa] shrink-0"
              onclick={(e) => {
                e.stopPropagation()
                window.electronAPI?.openInBrowser?.(conn.url)
              }}
              title="Open in browser"
            >
              <svg
                class="w-[12px] h-[12px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </button>
          </div>
        {/each}
      </div>

      <!-- Settings popover -->
      {#if settingsOpen}
        <div class="fixed inset-0 z-40" onclick={() => (settingsOpen = false)}></div>

        <div
          class="absolute bottom-12 left-2 right-2 z-50 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl py-1.5 overflow-hidden"
          in:fly={{ y: 8, duration: 150 }}
          out:fade={{ duration: 100 }}
        >
          <div class="px-3.5 py-2.5 border-b border-white/[0.06]">
            <div class="text-[11px] opacity-40">Open WebUI Desktop</div>
            <div class="text-[10px] opacity-20 mt-0.5">{$appInfo?.version ?? ''}</div>
          </div>

          <div class="py-1">
            <button
              class="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-white/[0.05] transition bg-transparent border-none text-[#fafafa]"
              onclick={() => {
                settingsOpen = false
                onOpenSettings()
              }}
            >
              <svg
                class="w-[14px] h-[14px] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Settings
            </button>

            <button
              class="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-white/[0.05] transition bg-transparent border-none text-[#fafafa]"
              onclick={openGithub}
            >
              <svg
                class="w-[14px] h-[14px] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              GitHub
            </button>
          </div>
        </div>
      {/if}

      <!-- Settings button (bottom) -->
      <div class="px-2 pb-3 pt-2">
        <button
          class="w-full flex items-center gap-2 px-2 py-[6px] rounded-xl text-[12px] opacity-40 hover:opacity-70 hover:bg-white/[0.05] transition bg-transparent border-none text-[#fafafa] text-left"
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          <svg
            class="w-[14px] h-[14px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Settings
        </button>
      </div>
    </div>
  {/if}

  <!-- Main content -->
  <div
    class="flex-1 flex flex-col min-w-0 overflow-clip bg-[#111] border-t {sidebarOpen
      ? 'border-l border-white/[0.08] rounded-tl-xl'
      : 'border-white/[0.10]'}"
  >
    <!-- Webviews — all open connections stay alive, only active one visible -->
    {#each [...openConnections] as [connId, connUrl] (connId)}
      <webview
        src={connUrl}
        class="flex-1 min-h-0 border-none"
        style="display: {view === 'connected' && activeConnectionId === connId ? 'flex' : 'none'}"
        allowpopups
        partition="persist:connection-{connId}"
      ></webview>
    {/each}

    {#if view === 'logs'}
      <!-- Terminal / Logs -->
      <div
        class="flex-1 min-h-0 overflow-hidden px-3 py-2 bg-[#0a0a0a]"
        bind:this={terminalEl}
      ></div>
    {:else if view !== 'connected'}
      {#if isInitializing}
        <div class="px-5 py-1.5 text-[11px] opacity-25">
          Setting up…{$serverInfo?.status ? ` ${$serverInfo.status}` : ''}
        </div>
      {/if}

      <div class="flex-1 flex items-center justify-center px-6">
        {#if view === 'welcome'}
          <div class="text-center max-w-[320px]" in:fade={{ duration: 200 }}>
            {#if ($connections ?? []).length > 0}
              <div class="text-lg opacity-80 mb-1.5">Open WebUI</div>
              <div class="text-[12px] opacity-30 mb-6">
                Select a connection from the sidebar to get started
              </div>
            {:else}
              <div class="text-lg opacity-80 mb-1.5">Welcome to Open WebUI</div>
              <div class="text-[12px] opacity-30 mb-6">
                To get started, connect to an existing server or
              </div>

              <button
                class="inline-flex items-center gap-2 bg-white px-5 py-2 rounded-xl text-black text-[13px] transition hover:bg-gray-100 border-none"
                onclick={() => (view = 'add')}
              >
                + Add new connection
              </button>

              {#if !hasLocal}
                <div class="mt-5 pt-5 border-t border-white/[0.06]">
                  <div class="text-[12px] opacity-40 mb-1.5">Don't have a server?</div>
                  <div class="text-[11px] opacity-20 mb-3 leading-relaxed">
                    You can install and run Open WebUI locally on this machine.
                  </div>
                  <button
                    class="text-[12px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#fafafa]"
                    onclick={() => (view = 'install')}
                  >
                    Install locally →
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {:else if view === 'add'}
          <div class="w-full max-w-[260px]" in:fade={{ duration: 150 }}>
            <div class="text-base opacity-70 mb-4">New Connection</div>

            <div class="flex flex-col gap-2.5">
              <input
                type="text"
                bind:value={url}
                placeholder="e.g. https://your-server.com"
                class="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] text-[13px] text-[#fafafa] placeholder:opacity-20 outline-none focus:bg-white/[0.1] transition no-drag border-none"
                onkeydown={(e) => e.key === 'Enter' && addConnection()}
              />

              {#if error}
                <p class="text-[11px] opacity-60">{error}</p>
              {/if}

              <div class="flex items-center gap-3 mt-1">
                <button
                  class="inline-flex items-center gap-2 bg-white px-5 py-2 rounded-xl text-black text-[13px] transition hover:bg-gray-100 disabled:opacity-30 border-none"
                  onclick={addConnection}
                  disabled={connecting || !url.trim()}
                >
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>

                <button
                  class="text-[12px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#fafafa]"
                  onclick={() => {
                    view = 'welcome'
                    error = ''
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        {:else if view === 'install'}
          <div class="w-full max-w-[260px]">
            <LocalInstall
              onBack={() => (view = 'welcome')}
              onComplete={async () => {
                connections.set(await window.electronAPI.getConnections())
                config.set(await window.electronAPI.getConfig())
                view = 'welcome'
              }}
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
