<script lang="ts">
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { connections, config, serverInfo, appState } from '../../../stores'
  import i18n from '../../../i18n'
  import LocalInstall from '../../Setup/LocalInstall.svelte'
  import GetStartedModal from './GetStartedModal.svelte'
  import AddConnectionModal from './AddConnectionModal.svelte'
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
    onStartInstall: (options?: { installOpenTerminal?: boolean; installLlamaCpp?: boolean; installDir?: string }) => void
    onAddConnection: () => void
    onSetView: (v: string) => void
    showAddConnectionModal: boolean
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
    onSetView,
    showAddConnectionModal = $bindable(false)
  }: Props = $props()

  let showGetStartedModal = $state(false)

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

  // Track webview load errors per connection
  let webviewErrors: Map<string, { code: number; description: string; url: string }> = $state(new Map())

  // Content preload path for webview bridge
  let contentPreloadPath: string = $state('')

  // Server is starting up (local)
  const serverStarting = $derived(
    localConn && localInstalled && (
      $serverInfo?.status === 'starting' ||
      ($serverInfo?.status === 'running' && !$serverInfo?.reachable)
    )
  )

  const activeWebviewError = $derived(
    view === 'connected' && activeConnectionId
      ? webviewErrors.get(activeConnectionId) ?? null
      : null
  )

  const isLoading = $derived(
    connectingId !== '' ||
    (serverStarting && activeConnectionId === localConn?.id) ||
    (view === 'connected' && !activeWebviewError && webviewLoading.get(activeConnectionId) === true)
  )

  const retryActiveWebview = () => {
    const wv = document.querySelector(
      `webview[partition="persist:connection-${activeConnectionId}"]`
    ) as any
    if (wv?.reload) {
      webviewErrors.delete(activeConnectionId)
      webviewErrors = new Map(webviewErrors)
      wv.reload()
    }
  }

  const openActiveInBrowser = () => {
    const connUrl = openConnections.get(activeConnectionId)
    if (connUrl) {
      window.electronAPI.openInBrowser(connUrl)
    }
  }

  // Attach load event listeners and IPC forwarding to webviews
  onMount(async () => {
    // Fetch the content preload path once
    contentPreloadPath = await window.electronAPI.getContentPreloadPath()

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

        // Track load failures so we can show an error overlay
        wv.addEventListener('did-fail-load', (event: any) => {
          // Ignore sub-resource failures and aborted navigations (-3)
          if (event.errorCode === -3 || event.isMainFrame === false) return
          webviewErrors.set(connId, {
            code: event.errorCode,
            description: event.errorDescription || 'Unknown error',
            url: event.validatedURL || ''
          })
          webviewErrors = new Map(webviewErrors)
        })

        // Clear error when a navigation succeeds (retry, redirect, etc.)
        wv.addEventListener('did-navigate', () => {
          if (webviewErrors.has(connId)) {
            webviewErrors.delete(connId)
            webviewErrors = new Map(webviewErrors)
          }
        })

        // Renderer process crash
        wv.addEventListener('crashed', () => {
          webviewErrors.set(connId, {
            code: -1,
            description: 'crashed',
            url: ''
          })
          webviewErrors = new Map(webviewErrors)
        })

        // Log guest page console messages for debugging blank-page issues (#124)
        wv.addEventListener('console-message', (event: any) => {
          if (event.level >= 2) { // warnings and errors only
            console.warn(`[webview:${connId}]`, event.message)
          }
        })

        // If this webview was created before the preload path resolved
        // (race between auto-connect and async IPC), the preload didn't
        // attach.  Force a reload now so it picks up the correct preload.
        if (contentPreloadPath && wv.getAttribute('preload') !== contentPreloadPath) {
          wv.setAttribute('preload', contentPreloadPath)
          wv.reload()
        }

        // Handle IPC messages from the webview guest (Open WebUI → desktop)
        wv.addEventListener('ipc-message', async (event: any) => {
          if (event.channel === 'webview:send') {
            const requestData = event.args?.[0]
            if (!requestData) return

            // Handle auth token relay from webview
            if (requestData.type === 'token:update' && requestData.token) {
              window.electronAPI.setAuthToken?.(requestData.token)
              return
            }

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
          } else if (event.channel === 'webview:event') {
            const payload = event.args?.[0]
            if (!payload?.type) return

            if (payload.type === 'theme:update') {
              const webuiTheme = payload.data?.theme ?? 'system'

              // Map Open WebUI theme names to desktop-compatible values
              let desktopTheme: string
              if (webuiTheme === 'system') {
                desktopTheme = 'system'
              } else if (webuiTheme.includes('dark')) {
                desktopTheme = 'dark'
              } else {
                desktopTheme = 'light'
              }

              // Resolve and apply CSS class
              let resolved = desktopTheme
              if (desktopTheme === 'system') {
                resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
              }
              document.documentElement.classList.remove('light', 'dark')
              document.documentElement.classList.add(resolved)

              // Persist to desktop config
              await window.electronAPI.setConfig({ theme: desktopTheme })
              config.set(await window.electronAPI.getConfig())
            }
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
      partition="persist:connection-{connId}"
      preload={contentPreloadPath}
      allowpopups
    ></webview>
  {/each}

  <!-- Error overlay when webview fails to load -->
  {#if activeWebviewError}
    <div class="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] dark:bg-[#111]" transition:fade={{ duration: 200 }}>
      <div class="text-center max-w-sm px-6">
        <div class="mx-auto mb-4 w-10 h-10 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
          {#if activeWebviewError.code === -1}
            <svg class="w-5 h-5 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          {:else}
            <svg class="w-5 h-5 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          {/if}
        </div>
        <div class="text-[14px] font-medium mb-1 opacity-80">
          {activeWebviewError.code === -1 ? $i18n.t('setup.pageCrashed') : $i18n.t('setup.couldNotLoadPage')}
        </div>
        <div class="text-[12px] opacity-30 mb-1">{activeWebviewError.description}</div>
        {#if activeWebviewError.url}
          <div class="text-[11px] opacity-20 mb-6 break-all font-mono">{activeWebviewError.url}</div>
        {:else}
          <div class="mb-6"></div>
        {/if}
        <div class="flex gap-2 justify-center">
          <button
            class="px-4 py-2 rounded-xl text-[13px] font-medium bg-black dark:bg-white text-white dark:text-black border-none cursor-pointer transition hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98]"
            onclick={retryActiveWebview}
          >
            {$i18n.t('common.retry')}
          </button>
          <button
            class="px-4 py-2 rounded-xl text-[13px] bg-black/[0.04] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#fafafa] border-none cursor-pointer opacity-60 hover:opacity-90 transition active:scale-[0.98]"
            onclick={openActiveInBrowser}
          >
            {$i18n.t('setup.openInBrowser')}
          </button>
        </div>
      </div>
    </div>
  {/if}

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
                    onclick={() => {
                      if (installPhase === 'error') {
                        onStartInstall()
                      } else {
                        showGetStartedModal = true
                      }
                    }}
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

                {#if installPhase !== 'working'}
                <div class="mt-6">
                  <button
                    class="text-sm opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                    onclick={() => { showAddConnectionModal = true }}
                  >
                    {$i18n.t('setup.connectToServer')}
                  </button>
                </div>
                {/if}
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

  {#if showGetStartedModal}
    <GetStartedModal
      onContinue={(options) => {
        showGetStartedModal = false
        onStartInstall(options)
      }}
      onCancel={() => { showGetStartedModal = false }}
    />
  {/if}

  {#if showAddConnectionModal}
    <AddConnectionModal
      bind:url
      bind:connecting
      bind:error
      onConnect={() => {
        onAddConnection()
      }}
      onCancel={() => {
        showAddConnectionModal = false
        error = ''
      }}
    />
  {/if}
</div>
