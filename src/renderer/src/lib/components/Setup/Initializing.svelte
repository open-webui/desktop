<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { serverInfo, appState } from '../../stores'
  import i18n from '../../i18n'

  import logoImage from '../../assets/images/splash.png'

  let { phase = 'loading' } = $props()
  let visible = $state(false)
  let installError = $state('')
  let videoElement: HTMLVideoElement

  // Extract available GB from appState like 'insufficient-storage:2.3'
  const availableGB = $derived(
    $appState?.startsWith('insufficient-storage:')
      ? $appState.split(':')[1]
      : null
  )

  // Extract error message from appState like 'install-failed:message'
  const installFailedMsg = $derived(
    $appState?.startsWith('install-failed:')
      ? $appState.substring('install-failed:'.length)
      : null
  )

  const retryCheck = async () => {
    installError = ''
    const api = window?.electronAPI
    if (!api) return

    const MINIMUM_DISK_BYTES = 5 * 1024 * 1024 * 1024
    const disk = await api.getDiskSpace()
    if (disk?.free >= 0 && disk.free < MINIMUM_DISK_BYTES) {
      const gb = (disk.free / (1024 * 1024 * 1024)).toFixed(1)
      appState.set(`insufficient-storage:${gb}`)
      return
    }

    // Enough space now — proceed with Python install
    appState.set('initializing')
    try {
      await api.installPython()
      appState.set('ready')
    } catch (e: any) {
      installError = e?.message || $i18n.t('error.somethingWentWrong')
    }
  }

  onMount(() => {
    setTimeout(() => { visible = true }, 100)
    if (videoElement) {
      videoElement.play().catch(() => {})
    }
  })
</script>

{#if visible}
  <div class="h-full w-full relative overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]" in:fade={{ duration: 500 }}>
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

    <div class="relative z-10 h-full flex items-center justify-center">
      <div class="flex flex-col items-center gap-5">
        <img src={logoImage} class="size-14 rounded-full dark:invert" alt={$i18n.t('app.name')} />

        {#if availableGB}
          <div class="flex flex-col items-center gap-3 text-center" in:fade={{ duration: 250 }}>
            <div class="text-sm text-red-400 opacity-80">
              {$i18n.t('error.notEnoughDiskSpace')}
            </div>
            <div class="text-[11px] text-[#1d1d1f] dark:text-[#fafafa] opacity-30 max-w-[260px] leading-relaxed">
              {$i18n.t('error.diskSpaceDetail', { available: availableGB })}
            </div>
            <button
              class="mt-2 inline-flex items-center gap-2 bg-black/[0.04] dark:bg-white/[0.06] px-6 py-2 text-[12px] opacity-60 hover:opacity-90 transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-lg cursor-pointer"
              onclick={retryCheck}
            >
              {$i18n.t('common.retry')}
            </button>
          </div>
        {:else if installError || installFailedMsg}
          <div class="flex flex-col items-center gap-3 text-center" in:fade={{ duration: 250 }}>
            <div class="text-sm text-red-400 opacity-80">
              {$i18n.t('error.installFailedGeneric')}
            </div>
            <div class="text-[11px] text-[#1d1d1f] dark:text-[#fafafa] opacity-30 max-w-[280px] leading-relaxed">
              {installError || installFailedMsg}
            </div>
            <button
              class="mt-2 inline-flex items-center gap-2 bg-black/[0.04] dark:bg-white/[0.06] px-6 py-2 text-[12px] opacity-60 hover:opacity-90 transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-lg cursor-pointer"
              onclick={retryCheck}
            >
              {$i18n.t('common.retry')}
            </button>
          </div>
        {:else if phase === 'initializing'}
          <div class="flex flex-col items-center gap-2 text-center">
            <div class="text-sm text-[#1d1d1f] dark:text-[#fafafa] opacity-50">
              {$i18n.t('setup.preparingEnvironment')}
            </div>
            {#if $serverInfo?.status}
              <div class="text-[11px] text-[#1d1d1f] dark:text-[#fafafa] opacity-25 max-w-[220px] leading-relaxed">
                {$serverInfo.status}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
