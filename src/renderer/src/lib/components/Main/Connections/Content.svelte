<script lang="ts">
  import type { WebviewTag, DidFailLoadEvent, ConsoleMessageEvent, IpcMessageEvent } from 'electron'
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
    launchError,
    localInstalled,
    installPhase,
    installError,
    installStatus,
    toastVisible,
    onStartInstall,
    onOpenWebUI
  }: {
    serverUrl: string
    connecting: boolean
    launchError: string
    localInstalled: boolean
    installPhase: string
    installError: string
    installStatus: string
    toastVisible: boolean
    onStartInstall: (options?: { installLlamaCpp?: boolean; installDir?: string }) => void
    onOpenWebUI: () => void
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
  let webviewError = $state<{ code: number; description: string; url: string } | null>(null)
  let contentPreloadPath = $state('')
  let webview: WebviewTag | undefined
  const activeWebviewError = $derived(serverUrl ? webviewError : null)
  const isLoading = $derived(connecting || (!!serverUrl && !activeWebviewError && webviewLoading))

  const retryActiveWebview = (): void => {
    webviewError = null
    webview?.reload()
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
    listen('did-stop-loading', () => {
      webviewLoading = false
    })
    listen('did-fail-load', (event: DidFailLoadEvent) => {
      if (event.errorCode === -3 || event.isMainFrame === false) return
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
        const webuiTheme = payload.data?.theme ?? 'system'
        const theme =
          webuiTheme === 'system' ? 'system' : webuiTheme.includes('dark') ? 'dark' : 'light'
        const resolved =
          theme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : theme
        document.documentElement.classList.remove('light', 'dark')
        document.documentElement.classList.add(resolved)
        await window.electronAPI.setConfig({ theme })
        config.set(await window.electronAPI.getConfig())
      }
    })
    return {
      destroy() {
        disposed = true
        unsubscribe()
        for (const [name, callback] of listeners) wv.removeEventListener(name, callback)
        webview = undefined
      }
    }
  }
</script>

<div
  class="flex-1 flex flex-col min-h-0 min-w-0 overflow-clip bg-[#eee] dark:bg-[#111] relative content-webview-container"
>
  {#if serverUrl && contentPreloadPath}
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
            <svg
              class="w-5 h-5 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          {:else}
            <svg
              class="w-5 h-5 opacity-30"
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
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-[#eee] dark:bg-[#111]"
      transition:fade={{ duration: 200 }}
    >
      <div class="flex flex-col items-center gap-3">
        <div
          class="w-6 h-6 rounded-full border-2 border-black/10 dark:border-white/15 border-t-black/50 dark:border-t-white/50 animate-spin"
        ></div>
        <span class="text-[11px] opacity-30">{$i18n.t('common.loading')}</span>
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
                  class="inline-flex items-center justify-between gap-2 w-[220px] max-w-full h-[36px] bg-black dark:bg-white px-4 rounded-none text-white dark:text-black text-[13px] border-none disabled:opacity-50"
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
                    <svg
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7"
                      />
                    </svg>
                  {:else}
                    {$i18n.t('main.getStarted')}
                    <svg
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
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
