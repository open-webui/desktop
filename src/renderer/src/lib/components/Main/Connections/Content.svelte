<script lang="ts">
  import ArrowRightIcon from 'iconoir/icons/arrow-right.svg?raw'
  import GlobeIcon from 'iconoir/icons/globe.svg?raw'
  import RestartIcon from 'iconoir/icons/restart.svg?raw'
  import WarningCircleIcon from 'iconoir/icons/warning-circle.svg?raw'
  import type { WebviewTag, DidFailLoadEvent, ConsoleMessageEvent, IpcMessageEvent, PageTitleUpdatedEvent } from 'electron'
  import { handleGuestRequest } from '../../../guest-requests'
  import { onMount } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import { config, serverInfo, appState } from '../../../stores'
  import i18n from '../../../i18n'
  import GetStartedModal from './GetStartedModal.svelte'
  import logoImage from '../../../assets/images/splash.png'
  import landingVideo from '../../../../assets/landing.mp4'

  let {
    serverUrl,
    connecting,
    canRefresh = $bindable(false),
    launchError,
    localInstalled,
    installPhase,
    installError,
    installStatus,
    toastVisible,
    onStartInstall,
    onOpenWebUI,
    onOpenTerminal
  }: {
    serverUrl: string
    connecting: boolean
    canRefresh?: boolean
    launchError: string
    localInstalled: boolean
    installPhase: string
    installError: string
    installStatus: string
    toastVisible: boolean
    onStartInstall: (options?: { installLlamaCpp?: boolean; installDir?: string }) => void
    onOpenWebUI: () => void
    onOpenTerminal: () => void
  } = $props()

  let showGetStartedModal = $state(false)

  const isInitializing = $derived($appState === 'initializing')
  const insufficientStorage = $derived(
    $appState?.startsWith('insufficient-storage:') ? $appState.split(':')[1] : null
  )
  const installFailed = $derived(
    $appState?.startsWith('install-failed:') ? $appState.substring('install-failed:'.length) : null
  )

  let webviewLoading = $state(false)
  let webviewBackground = $state<string | null>(null)
  let webviewTitle = $state('')
  let webviewError = $state<{ code: number; description: string; url: string } | null>(null)
  let contentPreloadPath = $state('')
  let webview: WebviewTag | undefined
  const activeWebviewError = $derived(serverUrl ? webviewError : null)
  const isLoading = $derived(connecting || (!!serverUrl && !activeWebviewError && webviewLoading))
  let startupLine = $state('')
  const loadingStatus = $derived(startupLine || installStatus)

  $effect(() => {
    startupLine = ''
    if (!isLoading) return
    return window.electronAPI.onTerminalLine('server', (line: string) => {
      startupLine = line
    })
  })

  export const refresh = (): void => {
    if (!canRefresh || !webview) return
    webviewError = null
    webview.reload()
  }
  const openActiveInBrowser = (): void => window.electronAPI.openInBrowser(serverUrl)

  onMount(() => {
    let disposed = false
    window.electronAPI.getContentPreloadPath().then((path: string) => {
      if (!disposed) contentPreloadPath = path
    })
    return () => {
      disposed = true
    }
  })

  function attachWebview(wv: WebviewTag): { destroy: () => void } {
    webview = wv
    webviewBackground = null
    webviewTitle = ''
    canRefresh = false
    webviewError = null
    webviewLoading = true
    let disposed = false
    const listeners: [string, (event: Event) => void][] = []
    const listen = <E extends Event>(name: string, callback: (event: E) => void): void => {
      const listener = callback as (event: Event) => void
      wv.addEventListener(name, listener)
      listeners.push([name, listener])
    }
    const send = (event: unknown): void => {
      try {
        wv.send('desktop:event', event)
      } catch {
        /* Webview is navigating. */
      }
    }
    // Only local model events cross into WebUI; replay state when its listener is ready.
    const unsubscribe = window.electronAPI.onData((event) => {
      if (event.type === 'connections:openai' || event.type === 'models:refresh') send(event)
    })
    listen('did-start-loading', () => {
      webviewLoading = true
    })
    listen('dom-ready', () => {
      canRefresh = true
      webviewTitle = wv.getTitle()
    })
    listen('page-title-updated', (event: PageTitleUpdatedEvent) => {
      webviewTitle = event.title
    })
    listen('did-stop-loading', () => {
      webviewLoading = false
    })
    listen('did-fail-load', (event: DidFailLoadEvent) => {
      if (event.errorCode === -3 || event.isMainFrame === false) return
      canRefresh = true
      webviewError = {
        code: event.errorCode,
        description: event.errorDescription || 'Unknown error',
        url: event.validatedURL || ''
      }
    })
    listen('did-navigate', () => {
      webviewError = null
    })
    listen('render-process-gone', () => {
      webviewError = { code: -1, description: 'crashed', url: '' }
    })
    listen('console-message', (event: ConsoleMessageEvent) => {
      if (event.level >= 2) console.warn('[webview]', event.message)
    })
    listen('ipc-message', async (event: IpcMessageEvent) => {
      if (event.channel === 'webview:ready') {
        const info = await window.electronAPI.getLlamaCppInfo()
        if (!disposed && info?.reachable && info.url) {
          send({
            type: 'connections:openai',
            data: {
              action: 'add',
              url: `${info.url}/v1`,
              config: { provider: 'llama.cpp', connection_type: 'local' }
            }
          })
        }
      } else if (event.channel === 'webview:send') {
        const request = event.args?.[0]
        if (!request) return
        let response: unknown
        try {
          response = await handleGuestRequest(window.electronAPI, request)
        } catch {
          response = { error: 'Desktop request rejected' }
        }
        if (!disposed && request._requestId) {
          try {
            wv.send('desktop:response', { _responseId: request._requestId, data: response })
          } catch {
            /* Webview is navigating. */
          }
        }
      } else if (event.channel === 'webview:event') {
        const payload = event.args?.[0]
        if (payload?.type !== 'theme:update') return
        const webuiTheme = typeof payload.data?.theme === 'string' ? payload.data.theme : 'system'
        const theme =
          webuiTheme === 'system' ? 'system' : webuiTheme.includes('dark') ? 'dark' : 'light'
        const resolved = ['dark', 'light'].includes(payload.data?.resolvedTheme)
          ? payload.data.resolvedTheme
          : theme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : theme
        const background = payload.data?.background
        if (typeof background === 'string' && CSS.supports('color', background)) {
          webviewBackground = background
        }
        document.documentElement.classList.remove('light', 'dark')
        document.documentElement.classList.add(resolved)
        if ($config?.theme !== theme) {
          config.update((current) => ({ ...current, theme }))
          await window.electronAPI.setConfig({ theme })
        }
      }
    })
    return {
      destroy() {
        disposed = true
        unsubscribe()
        for (const [name, callback] of listeners) wv.removeEventListener(name, callback)
        webview = undefined
        webviewTitle = ''
        canRefresh = false
      }
    }
  }
</script>

<div
  class="flex-1 flex flex-col min-h-0 min-w-0 overflow-clip bg-[#eee] dark:bg-[#111] relative content-webview-container"
>
  {#if serverUrl && contentPreloadPath}
    <div
      class="webview-inset flex shrink-0 items-center justify-center bg-white px-[80px] dark:bg-[#171717]"
      style:height="var(--window-drag-height)"
      style:background-color={webviewBackground}
    >
      <span class="truncate text-[11px] font-medium opacity-60" title={webviewTitle}>{webviewTitle}</span>
    </div>
    <webview
      src={serverUrl}
      class="flex-1 min-h-0 border-none"
      style="display: flex"
      partition="persist:connection-local"
      preload={contentPreloadPath}
      use:attachWebview
      allowpopups
    ></webview>
  {/if}

  <!-- Error overlay when webview fails to load -->
  {#if activeWebviewError}
    <div
      class="absolute inset-0 z-20 flex items-center justify-center bg-[#eee] dark:bg-[#111]"
      transition:fade={{ duration: 200 }}
    >
      <div class="text-center max-w-sm px-6">
        <div
          class="mx-auto mb-4 w-10 h-10 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center"
        >
          {#if activeWebviewError.code === -1}
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-5 h-5 opacity-30">{@html WarningCircleIcon}</span>
          {:else}
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-5 h-5 opacity-30">{@html GlobeIcon}</span>
          {/if}
        </div>
        <div class="text-[14px] font-medium mb-1 opacity-80">
          {activeWebviewError.code === -1
            ? $i18n.t('setup.pageCrashed')
            : $i18n.t('setup.couldNotLoadPage')}
        </div>
        <div class="text-[12px] opacity-30 mb-1">{activeWebviewError.description}</div>
        {#if activeWebviewError.url}
          <div class="text-[11px] opacity-20 mb-6 break-all font-mono">
            {activeWebviewError.url}
          </div>
        {:else}
          <div class="mb-6"></div>
        {/if}
        <div class="flex gap-2 justify-center">
          <button
            class="px-4 py-2 rounded-xl text-[13px] font-medium bg-black dark:bg-white text-white dark:text-black border-none cursor-pointer transition hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98]"
            onclick={refresh}
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
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-[#eee] dark:bg-[#111]"
      transition:fade={{ duration: 200 }}
    >
      <div class="flex w-full min-w-0 flex-col items-center gap-3 px-6">
        <div
          class="w-6 h-6 rounded-full border-2 border-black/10 dark:border-white/15 border-t-black/50 dark:border-t-white/50 animate-spin"
        ></div>
        <div class="flex w-full min-w-0 flex-col items-center gap-1.5" role="status">
          <span class="text-[12px] opacity-90">{$i18n.t('common.loading')}</span>
          {#if loadingStatus}
            <button
              type="button"
              class="max-w-[min(240px,100%)] truncate font-mono text-[11px] opacity-25 hover:opacity-40 focus-visible:opacity-40"
              title={loadingStatus}
              aria-label={$i18n.t('logs.expand')}
              onclick={onOpenTerminal}
              >{loadingStatus}</button
            >
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if !serverUrl}
    {#if insufficientStorage}
      <div class="px-5 py-2.5 flex items-center gap-3 bg-red-500/[0.06] border-b border-red-500/10">
        <div class="flex-1">
          <div class="text-[12px] text-red-400 font-medium">
            {$i18n.t('main.notEnoughDiskSpace')}
          </div>
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
            window.electronAPI
              .installPython()
              .then(() => appState.set('ready'))
              .catch((e) => {
                appState.set(
                  `install-failed:${e?.message || 'Python installation failed. Please try again.'}`
                )
              })
          }}
        >
          {$i18n.t('common.retry')}
        </button>
      </div>
    {:else if installFailed}
      <div class="px-5 py-2.5 flex items-center gap-3 bg-red-500/[0.06] border-b border-red-500/10">
        <div class="flex-1">
          <div class="text-[12px] text-red-400 font-medium">
            {$i18n.t('error.installFailedGeneric')}
          </div>
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
            window.electronAPI
              .installPython()
              .then(() => appState.set('ready'))
              .catch((e) => {
                appState.set(
                  `install-failed:${e?.message || 'Python installation failed. Please try again.'}`
                )
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
      {#if localInstalled}
        <div class="text-center max-w-[320px]" in:fade={{ duration: 200 }}>
          <div class="text-lg opacity-80 mb-1.5">{$i18n.t('app.name')}</div>
          <div class="text-[12px] opacity-30 mb-6">
            {$i18n.t('main.localReady')}
          </div>
          <button
            class="px-4 py-2 rounded-xl text-[13px] bg-black dark:bg-white text-white dark:text-black border-none disabled:opacity-40"
            onclick={onOpenWebUI}
            disabled={connecting || installPhase === 'working'}>{$i18n.t('main.openWebUI')}</button
          >
          {#if launchError}<div class="mt-3 text-[12px] opacity-60" role="alert">
              {launchError}
            </div>{/if}
          {#if installPhase === 'working' && installStatus}<div class="mt-3 text-[12px] opacity-40">
              {installStatus}
            </div>{/if}
        </div>
      {:else}
        <!-- Theme-responsive hero section -->
        <div class="absolute inset-0 bg-white dark:bg-black">
          <!-- Video background -->
          <video
            autoplay
            muted
            loop
            playsinline
            class="absolute inset-0 w-full h-full object-cover pointer-events-none"
          >
            <source src={landingVideo} type="video/mp4" />
          </video>

          <!-- Gradient overlay -->
          <div
            class="absolute inset-0 bg-gradient-to-b from-white/10 via-white/90 via-75% to-white dark:from-black/10 dark:via-black/90 dark:to-black pointer-events-none"
          ></div>

          <img
            src={logoImage}
            alt=""
            draggable="false"
            class="absolute left-[34px] top-[48px] w-[30px] h-[30px] dark:invert pointer-events-none"
          />

          <!-- Content positioned bottom-left -->
          <div class="absolute bottom-0 left-0 right-0 px-[40px] py-[56px]" in:fade={{ duration: 300 }}>
            <div class="max-w-[440px]">
              <div
                class="text-3xl font-medium mb-3 tracking-tight text-black dark:text-white"
              >
                {$i18n.t('app.name')}
              </div>
              <div
                class="text-base opacity-60 mb-8 leading-relaxed text-black dark:text-white"
              >
                {$i18n.t('main.localDescription')}
              </div>

              {#if !localInstalled}
                <button
                  class="inline-flex items-center {installPhase === 'working' ? 'justify-start' : 'justify-between'} gap-2 w-[220px] max-w-full h-[36px] bg-black dark:bg-white px-4 rounded-none text-white dark:text-black text-[13px] border-none disabled:opacity-50"
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
                    <div
                      class="w-3.5 h-3.5 rounded-full border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black animate-spin"
                    ></div>
                    {$i18n.t('common.installing')}
                  {:else if installPhase === 'error'}
                    {$i18n.t('common.retry')}
                    <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full h-3.5 w-3.5">{@html RestartIcon}</span>
                  {:else}
                    {$i18n.t('main.getStarted')}
                    <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full h-3.5 w-3.5">{@html ArrowRightIcon}</span>
                  {/if}
                </button>

                {#if installPhase === 'working' && installStatus}
                  <div
                    class="mt-3 text-[12px] opacity-40 font-mono line-clamp-1"
                    in:fade={{ duration: 200 }}
                  >
                    {installStatus}
                  </div>
                {/if}
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
    </div>
  {/if}

  {#if showGetStartedModal}
    <GetStartedModal
      onContinue={(options) => {
        showGetStartedModal = false
        onStartInstall(options)
      }}
      onCancel={() => {
        showGetStartedModal = false
      }}
    />
  {/if}
</div>
