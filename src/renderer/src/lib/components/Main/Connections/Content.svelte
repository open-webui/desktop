<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { connections, config, serverInfo, appState } from '../../../stores'
  import i18n from '../../../i18n'
  import LocalInstall from '../../Setup/LocalInstall.svelte'
  import landingVideo from '../../../../assets/landing.mp4'

  interface Props {
    sidebarOpen: boolean
    view: string
    activeConnectionId: string
    connectingId: string
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
    onStartInstall: () => void
    onAddConnection: () => void
    onSetView: (v: string) => void
  }

  let {
    sidebarOpen,
    view,
    activeConnectionId,
    connectingId,
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
    onStartInstall,
    onAddConnection,
    onSetView
  }: Props = $props()

  const isInitializing = $derived($appState === 'initializing')
  const insufficientStorage = $derived(
    $appState?.startsWith('insufficient-storage:')
      ? $appState.split(':')[1]
      : null
  )
  const installFailed = $derived(
    $appState?.startsWith('install-failed:')
      ? $appState.substring('install-failed:'.length)
      : null
  )


  // Track webview loading per connection
  let webviewLoading: Map<string, boolean> = $state(new Map())

  // Content preload path for webview bridge
  let contentPreloadPath: string = $state('')

  // Server is starting up (local)
  const serverStarting = $derived(
    localConn && localInstalled && (
      $serverInfo?.status === 'starting' ||
      ($serverInfo?.status === 'running' && !$serverInfo?.reachable)
    )
  )

  const isLoading = $derived(
    connectingId !== '' ||
    serverStarting ||
    (view === 'connected' && activeConnectionId && (webviewLoading.get(activeConnectionId) ?? true))
  )

  // Attach load event listeners and IPC forwarding to webviews
  onMount(async () => {
    // Fetch the content preload path once
    contentPreloadPath = await window.electronAPI.getContentPreloadPath()

    // Forward main:data events from the main process into all active webviews
    window.electronAPI.onData((data: any) => {
      const container = document.querySelector('.content-webview-container')
      if (!container) return
      const webviews = container.querySelectorAll('webview')
      webviews.forEach((wv: any) => {
        try {
          wv.send('desktop:event', data)
        } catch (_) {
          // webview may not be ready yet
        }
      })
    })

    const observer = new MutationObserver(() => {
      const container = document.querySelector('.content-webview-container')
      if (!container) return
      const webviews = container.querySelectorAll('webview')
      webviews.forEach((wv: any) => {
        if (wv._loadListenerAttached) return
        wv._loadListenerAttached = true
        const connId = wv.getAttribute('partition')?.replace('persist:connection-', '') ?? ''
        if (!connId) return

        // Mark loading when navigation starts
        wv.addEventListener('did-start-loading', () => {
          webviewLoading.set(connId, true)
          webviewLoading = new Map(webviewLoading)
        })

        // Clear loading when done
        wv.addEventListener('did-stop-loading', () => {
          webviewLoading.set(connId, false)
          webviewLoading = new Map(webviewLoading)
        })

        // Handle IPC messages from the webview guest (Open WebUI → desktop)
        wv.addEventListener('ipc-message', async (event: any) => {
          if (event.channel === 'webview:send') {
            const requestData = event.args?.[0]
            if (!requestData) return
            try {
              const response = await window.electronAPI[requestData.type]?.(requestData)
              if (requestData._requestId) {
                wv.send('desktop:response', {
                  _responseId: requestData._requestId,
                  data: response
                })
              }
            } catch (e) {
              console.error('webview:send handler error:', e)
            }
          } else if (event.channel === 'webview:load') {
            const page = event.args?.[0]
            if (page) onSetView(page === 'home' ? 'welcome' : page)
          }
        })
      })
    })

    const target = document.querySelector('.content-webview-container')
    if (target) {
      observer.observe(target, { childList: true, subtree: true })
    }

    return () => observer.disconnect()
  })
</script>

<div
  class="flex-1 flex flex-col min-w-0 overflow-clip bg-[#eee] dark:bg-[#111] border-t relative content-webview-container {sidebarOpen
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
      preload={contentPreloadPath}
    ></webview>
  {/each}

  <!-- Loading overlay for webview -->
  {#if isLoading}
    <div class="absolute inset-0 z-10 flex items-center justify-center bg-[#eee] dark:bg-[#111]" transition:fade={{ duration: 200 }}>
      <div class="flex flex-col items-center gap-3">
        <div class="w-6 h-6 rounded-full border-2 border-black/10 dark:border-white/15 border-t-black/50 dark:border-t-white/50 animate-spin"></div>
        <span class="text-[11px] opacity-30">{$i18n.t('common.loading')}</span>
      </div>
    </div>
  {/if}

  {#if view !== 'connected'}
    {#if insufficientStorage}
      <div class="px-5 py-2.5 flex items-center gap-3 bg-red-500/[0.06] border-b border-red-500/10">
        <div class="flex-1">
          <div class="text-[12px] text-red-400 font-medium">{$i18n.t('main.notEnoughDiskSpace')}</div>
          <div class="text-[11px] opacity-40 mt-0.5">
            {$i18n.t('main.diskSpaceRequired', { available: insufficientStorage })}
          </div>
        </div>
        <button
          class="shrink-0 text-[11px] px-3 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] opacity-60 hover:opacity-90 transition border-none text-[#1d1d1f] dark:text-[#fafafa] cursor-pointer"
          onclick={async () => {
            const MINIMUM_DISK_BYTES = 5 * 1024 * 1024 * 1024
            const disk = await window.electronAPI.getDiskSpace()
            if (disk?.free >= 0 && disk.free < MINIMUM_DISK_BYTES) {
              const gb = (disk.free / (1024 * 1024 * 1024)).toFixed(1)
              appState.set(`insufficient-storage:${gb}`)
              return
            }
            appState.set('initializing')
            window.electronAPI.installPython().then(() => appState.set('ready')).catch((e: any) => {
              appState.set(`install-failed:${e?.message || 'Python installation failed. Please try again.'}`)
            })
          }}
        >
          {$i18n.t('common.retry')}
        </button>
      </div>
    {:else if installFailed}
      <div class="px-5 py-2.5 flex items-center gap-3 bg-red-500/[0.06] border-b border-red-500/10">
        <div class="flex-1">
          <div class="text-[12px] text-red-400 font-medium">{$i18n.t('error.installFailedGeneric')}</div>
          <div class="text-[11px] opacity-40 mt-0.5 line-clamp-2">
            {installFailed}
          </div>
        </div>
        <button
          class="shrink-0 text-[11px] px-3 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] opacity-60 hover:opacity-90 transition border-none text-[#1d1d1f] dark:text-[#fafafa] cursor-pointer"
          onclick={async () => {
            const MINIMUM_DISK_BYTES = 5 * 1024 * 1024 * 1024
            const disk = await window.electronAPI.getDiskSpace()
            if (disk?.free >= 0 && disk.free < MINIMUM_DISK_BYTES) {
              const gb = (disk.free / (1024 * 1024 * 1024)).toFixed(1)
              appState.set(`insufficient-storage:${gb}`)
              return
            }
            appState.set('initializing')
            window.electronAPI.installPython().then(() => appState.set('ready')).catch((e: any) => {
              appState.set(`install-failed:${e?.message || 'Python installation failed. Please try again.'}`)
            })
          }}
        >
          {$i18n.t('common.retry')}
        </button>
      </div>
    {:else if isInitializing}
      <div class="px-5 py-1.5 text-[11px] opacity-25">
        {$i18n.t('setup.settingUp')}{$serverInfo?.status ? ` ${$serverInfo.status}` : ''}
      </div>
    {/if}

    <div class="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
      {#if view === 'welcome'}
        {#if remoteConnections.length > 0 || (localConn && localInstalled)}
          <div class="text-center max-w-[320px]" in:fade={{ duration: 200 }}>
            <div class="text-lg opacity-80 mb-1.5">{$i18n.t('app.name')}</div>
            <div class="text-[12px] opacity-30 mb-6">
              {$i18n.t('main.selectConnection')}
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
                <div class="text-3xl font-medium mb-3 tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">{$i18n.t('app.name')}</div>
                <div class="text-base opacity-50 mb-8 leading-relaxed text-[#1d1d1f] dark:text-[#fafafa]">
                  {$i18n.t('main.heroDescription')}
                </div>

                {#if !localInstalled}
                  <button
                    class="inline-flex items-center gap-2 bg-black dark:bg-white px-6 py-2 rounded-xl text-white dark:text-black text-[13px] transition hover:bg-gray-800 dark:hover:bg-gray-100 border-none disabled:opacity-50"
                    onclick={onStartInstall}
                    disabled={installPhase === 'working'}
                  >
                    {#if installPhase === 'working'}
                      <div class="w-3.5 h-3.5 rounded-full border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black animate-spin"></div>
                      {$i18n.t('common.installing')}
                    {:else if installPhase === 'error'}
                      {$i18n.t('common.retry')}
                      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
                      </svg>
                    {:else}
                      {$i18n.t('main.getStarted')}
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
                    {$i18n.t('setup.connectToServer')}
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
          <div class="text-base opacity-70 mb-4">{$i18n.t('setup.newConnection')}</div>

          <div class="flex flex-col gap-2.5">
            <input
              type="text"
              bind:value={url}
              placeholder={$i18n.t('setup.urlPlaceholder')}
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
                {connecting ? $i18n.t('common.connecting') : $i18n.t('common.connect')}
              </button>

              <button
                class="text-[12px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                onclick={() => {
                  onSetView('welcome')
                  error = ''
                }}
              >
                {$i18n.t('common.cancel')}
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
