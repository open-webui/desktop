<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { serverInfo } from '../stores'

  import logoImage from '../assets/images/splash.png'

  let { phase = 'loading' } = $props()
  let visible = $state(false)
  let videoElement: HTMLVideoElement

  onMount(() => {
    setTimeout(() => { visible = true }, 100)
    if (videoElement) {
      videoElement.play().catch(() => {})
    }
  })
</script>

{#if visible}
  <div class="h-full w-full relative overflow-hidden bg-[#0a0a0a]" in:fade={{ duration: 500 }}>
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
        <img src={logoImage} class="size-14 rounded-full dark:invert" alt="logo" />

        {#if phase === 'initializing'}
          <div class="flex flex-col items-center gap-2 text-center">
            <div class="text-sm text-[#fafafa] opacity-50">
              Preparing environment…
            </div>
            {#if $serverInfo?.status}
              <div class="text-[11px] text-[#fafafa] opacity-25 max-w-[220px] leading-relaxed">
                {$serverInfo.status}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
