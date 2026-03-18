<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { connections, config, serverInfo, appState } from '../../../stores'
  import LocalInstall from '../../Setup/LocalInstall.svelte'
  import landingVideo from '../../../../assets/landing.mp4'

  interface Props {
    sidebarOpen: boolean
    view: string
    activeConnectionId: string
    openConnections: Map<string, string>
    localConn: any
    localInstalled: boolean
    remoteConnections: any[]
    installPhase: string
    installError: string
    installStatus: string
    toastVisible: boolean
    url: string
    connecting: boolean
    error: string
    autoInstall: boolean
    terminalEl?: HTMLDivElement
    otTerminalEl?: HTMLDivElement
    lsTerminalEl?: HTMLDivElement
    onStartInstall: () => void
    onAddConnection: () => void
    onSetView: (v: string) => void
    onCopyLogs: (type: 'server' | 'open-terminal' | 'llama-server') => string | null
  }

  let {
    sidebarOpen,
    view,
    activeConnectionId,
    openConnections,
    localConn,
    localInstalled,
    remoteConnections,
    installPhase = $bindable('idle'),
    installError = $bindable(''),
    installStatus = $bindable(''),
    toastVisible = $bindable(false),
    url = $bindable(''),
    connecting = $bindable(false),
    error = $bindable(''),
    autoInstall = $bindable(false),
    terminalEl = $bindable(),
    otTerminalEl = $bindable(),
    lsTerminalEl = $bindable(),
    onStartInstall,
    onAddConnection,
    onSetView,
    onCopyLogs
  }: Props = $props()

  const isInitializing = $derived($appState === 'initializing')
  let copied = $state(false)
</script>

<div
  class="flex-1 flex flex-col min-w-0 overflow-clip bg-[#eee] dark:bg-[#111] border-t {sidebarOpen
    ? 'border-l border-black/[0.08] dark:border-white/[0.08] rounded-tl-xl'
    : 'border-black/[0.08] dark:border-white/[0.10]'}"
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
    <div class="flex-1 min-h-0 overflow-hidden bg-[#0a0a0a] relative">
      <div
        class="absolute inset-0 px-3 py-2"
        bind:this={terminalEl}
      ></div>
      <button
        class="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] opacity-30 hover:opacity-90 hover:bg-black/[0.08] dark:bg-white/[0.12] transition border-none text-[#1d1d1f] dark:text-[#fafafa] cursor-pointer"
        onclick={() => {
          const text = onCopyLogs('server')
          if (text) {
            navigator.clipboard.writeText(text)
            copied = true
            setTimeout(() => { copied = false }, 1500)
          }
        }}
        title="Copy logs"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          {#if copied}
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          {/if}
        </svg>
      </button>
    </div>
  {:else if view === 'open-terminal-logs'}
    <!-- Open Terminal Logs -->
    <div class="flex-1 min-h-0 flex flex-col bg-[#0a0a0a]">
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <span class="text-[11px] opacity-40">Open Terminal Logs</span>
        <button
          class="text-[11px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
          onclick={() => { onSetView(activeConnectionId ? 'connected' : 'welcome') }}
        >
          Close
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-hidden relative">
        <div
          class="absolute inset-0 px-3 py-2"
          bind:this={otTerminalEl}
        ></div>
        <button
          class="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] opacity-30 hover:opacity-90 hover:bg-black/[0.08] dark:bg-white/[0.12] transition border-none text-[#1d1d1f] dark:text-[#fafafa] cursor-pointer"
          onclick={() => {
            const text = onCopyLogs('open-terminal')
            if (text) {
              navigator.clipboard.writeText(text)
              copied = true
              setTimeout(() => { copied = false }, 1500)
            }
          }}
          title="Copy logs"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            {#if copied}
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            {/if}
          </svg>
        </button>
      </div>
    </div>
  {:else if view === 'llamacpp-logs'}
    <!-- Llama Server Logs -->
    <div class="flex-1 min-h-0 flex flex-col bg-[#0a0a0a]">
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <span class="text-[11px] opacity-40">llama.cpp Logs</span>
        <button
          class="text-[11px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
          onclick={() => { onSetView(activeConnectionId ? 'connected' : 'welcome') }}
        >
          Close
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-hidden relative">
        <div
          class="absolute inset-0 px-3 py-2"
          bind:this={lsTerminalEl}
        ></div>
        <button
          class="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] opacity-30 hover:opacity-90 hover:bg-black/[0.08] dark:bg-white/[0.12] transition border-none text-[#1d1d1f] dark:text-[#fafafa] cursor-pointer"
          onclick={() => {
            const text = onCopyLogs('llama-server')
            if (text) {
              navigator.clipboard.writeText(text)
              copied = true
              setTimeout(() => { copied = false }, 1500)
            }
          }}
          title="Copy logs"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            {#if copied}
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            {/if}
          </svg>
        </button>
      </div>
    </div>
  {:else if view !== 'connected'}
    {#if isInitializing}
      <div class="px-5 py-1.5 text-[11px] opacity-25">
        Setting up…{$serverInfo?.status ? ` ${$serverInfo.status}` : ''}
      </div>
    {/if}

    <div class="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
      {#if view === 'welcome'}
        {#if remoteConnections.length > 0 || (localConn && localInstalled)}
          <div class="text-center max-w-[320px]" in:fade={{ duration: 200 }}>
            <div class="text-lg opacity-80 mb-1.5">Open WebUI</div>
            <div class="text-[12px] opacity-30 mb-6">
              Select a connection to get started
            </div>
          </div>
        {:else}
          <!-- Theme-responsive hero section -->
          <div class="absolute inset-0 bg-[#fafafa] dark:bg-[#111]">
            <!-- Video background -->
            <video
              autoplay
              muted
              loop
              playsinline
              class="absolute inset-0 w-full h-full object-cover opacity-30 dark:opacity-40 pointer-events-none"
            >
              <source src={landingVideo} type="video/mp4" />
            </video>

            <!-- Gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-[#fafafa] dark:from-[#111] via-[#fafafa]/30 dark:via-[#111]/30 to-transparent pointer-events-none"></div>

            <!-- Content positioned bottom-left -->
            <div class="absolute bottom-0 left-0 right-0 p-10" in:fade={{ duration: 300 }}>
              <div class="max-w-sm">
                <div class="text-3xl font-medium mb-3 tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">Open WebUI</div>
                <div class="text-base opacity-50 mb-8 leading-relaxed text-[#1d1d1f] dark:text-[#fafafa]">
                  Connect to an Open WebUI server, or set one up on this machine.
                </div>

                {#if !localInstalled}
                  <button
                    class="inline-flex items-center gap-2 bg-black dark:bg-white px-6 py-2 rounded-xl text-white dark:text-black text-[13px] transition hover:bg-gray-800 dark:hover:bg-gray-100 border-none disabled:opacity-50"
                    onclick={onStartInstall}
                    disabled={installPhase === 'working'}
                  >
                    {#if installPhase === 'working'}
                      <div class="w-3.5 h-3.5 rounded-full border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black animate-spin"></div>
                      Installing…
                    {:else if installPhase === 'error'}
                      Retry
                      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
                      </svg>
                    {:else}
                      Get Started
                      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    {/if}
                  </button>

                  {#if installPhase === 'working' && installStatus}
                    <div class="mt-3 text-[12px] opacity-40 font-mono line-clamp-1" in:fade={{ duration: 200 }}>
                      {installStatus}
                    </div>
                  {/if}
                {/if}

                <div class="mt-6">
                  <button
                    class="text-sm opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                    onclick={() => onSetView('add')}
                  >
                    Connect to existing server →
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Error toast -->
        {#if toastVisible && installError}
          <div
            class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-sm text-white text-[12px] px-4 py-2 rounded-xl shadow-lg"
            in:fly={{ y: -10, duration: 200 }}
            out:fade={{ duration: 150 }}
          >
            {installError}
          </div>
        {/if}
      {:else if view === 'add'}
        <div class="w-full max-w-[260px]" in:fade={{ duration: 150 }}>
          <div class="text-base opacity-70 mb-4">New Connection</div>

          <div class="flex flex-col gap-2.5">
            <input
              type="text"
              bind:value={url}
              placeholder="e.g. https://your-server.com"
              class="w-full px-4 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-[13px] text-[#1d1d1f] dark:text-[#fafafa] placeholder:opacity-20 outline-none focus:bg-black/[0.06] dark:focus:bg-white/[0.1] transition no-drag border-none"
              onkeydown={(e) => e.key === 'Enter' && onAddConnection()}
            />

            {#if error}
              <p class="text-[11px] opacity-60">{error}</p>
            {/if}

            <div class="flex items-center gap-3 mt-1">
              <button
                class="inline-flex items-center gap-2 bg-black dark:bg-white px-5 py-2 rounded-xl text-white dark:text-black text-[13px] transition hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-30 border-none"
                onclick={onAddConnection}
                disabled={connecting || !url.trim()}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>

              <button
                class="text-[12px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                onclick={() => {
                  onSetView('welcome')
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
            autoStart={autoInstall}
            onBack={() => { autoInstall = false; onSetView('welcome') }}
            onComplete={async () => {
              connections.set(await window.electronAPI.getConnections())
              config.set(await window.electronAPI.getConfig())
              onSetView('welcome')
            }}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
