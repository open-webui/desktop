<script lang="ts">
  import { onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { appState, connections, config } from '../../stores'
  import i18n from '../../i18n'
  import LocalInstall from './LocalInstall.svelte'

  import logoImage from '../../assets/images/splash.png'

  let view = $state('main') // main | install
  let url = $state('')
  let connecting = $state(false)
  let error = $state('')
  let mounted = $state(false)
  let videoElement: HTMLVideoElement

  onMount(() => {
    setTimeout(() => { mounted = true }, 100)
    if (videoElement) {
      videoElement.play().catch(() => {})
    }
  })

  const connect = async () => {
    if (!url.trim()) return
    let u = url.trim()
    if (!u.startsWith('http')) u = 'https://' + u
    error = ''
    connecting = true
    try {
      const valid = await window.electronAPI.validateUrl(u)
      if (!valid) { error = $i18n.t('setup.couldNotReachServer'); connecting = false; return }
      await window.electronAPI.addConnection({
        id: crypto.randomUUID(),
        name: new URL(u).hostname,
        type: 'remote',
        url: u
      })
      connections.set(await window.electronAPI.getConnections())
      config.set(await window.electronAPI.getConfig())
      const conns = await window.electronAPI.getConnections()
      await window.electronAPI.connectTo(conns[conns.length - 1].id)
      appState.set('ready')
    } catch {
      error = $i18n.t('setup.connectionFailed')
    } finally {
      connecting = false
    }
  }
</script>

<div class="h-full w-full relative overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
  <!-- Video background -->
  <div class="absolute inset-0 overflow-hidden">
    <video
      bind:this={videoElement}
      autoplay
      muted
      loop
      playsinline
      class="absolute top-1/2 left-1/2 h-auto min-h-full w-auto min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-30"
    >
      <source src="https://community.s3.openwebui.com/landing.mp4" type="video/mp4" />
    </video>
  </div>

  <!-- Drag region -->
  <div class="absolute top-0 left-0 right-0 h-8 drag-region z-10"></div>

  <!-- Content -->
  {#if mounted}
    <div class="relative z-10 h-full flex flex-col justify-end px-8 pb-10">
      {#if view === 'main'}
        <div class="max-w-sm" in:fly={{ duration: 500, y: 10 }}>
          <div class="mb-2 text-sm font-normal opacity-50">{$i18n.t('app.name')}</div>

          <h1 class="text-3xl leading-tight font-light tracking-tight mb-6">
            {$i18n.t('setup.newConnection')}
          </h1>

          <div class="flex flex-col gap-2.5">
            <div class="flex gap-2">
              <input
                type="text"
                bind:value={url}
                placeholder={$i18n.t('setup.urlPlaceholder')}
                class="flex-1 px-4 py-2.5 bg-black/[0.04] dark:bg-white/[0.06] text-[13px] text-[#1d1d1f] dark:text-[#fafafa] placeholder:opacity-20 outline-none focus:bg-white/[0.1] transition no-drag border-none"
                onkeydown={(e) => e.key === 'Enter' && connect()}
              />

              <button
                class="inline-flex items-center gap-2 bg-white px-6 py-2.5 text-black text-[13px] transition hover:bg-gray-100 disabled:opacity-30 border-none shrink-0"
                onclick={connect}
                disabled={connecting || !url.trim()}
              >
                {connecting ? $i18n.t('common.connecting') : $i18n.t('common.connect')}
                {#if !connecting}
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                {/if}
              </button>
            </div>

            {#if error}
              <p class="text-[11px] text-red-400 opacity-80">{error}</p>
            {/if}
          </div>

          <div class="mt-6">
            <button
              class="text-sm opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
              onclick={() => (view = 'install')}
            >
              {$i18n.t('setup.orInstallLocally')}
            </button>
          </div>
        </div>

      {:else if view === 'install'}
        <div class="max-w-sm">
          <LocalInstall
            onBack={() => (view = 'main')}
            onComplete={() => appState.set('ready')}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
