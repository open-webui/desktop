<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { onMount } from 'svelte'
  import { connections, config, serverInfo } from '../stores'

  import logoImage from '../assets/images/splash.png'

  let { onBack, onComplete } = $props()

  let phase = $state('ready') // ready | working | done | error
  let errorMsg = $state('')

  const install = async () => {
    phase = 'working'
    try {
      const ok = await window.electronAPI.installPackage()
      if (!ok) { phase = 'error'; errorMsg = 'Install failed'; return }

      await window.electronAPI.startServer()
      const info = await window.electronAPI.getServerInfo()

      await window.electronAPI.addConnection({
        id: 'local',
        name: 'Local',
        type: 'local',
        url: info?.url || 'http://127.0.0.1:8080'
      })
      await window.electronAPI.setDefaultConnection('local')
      connections.set(await window.electronAPI.getConnections())
      config.set(await window.electronAPI.getConfig())

      phase = 'done'
      setTimeout(async () => {
        await window.electronAPI.connectTo('local')
        onComplete()
      }, 800)
    } catch (e) {
      phase = 'error'
      errorMsg = e?.message || 'Something went wrong'
    }
  }
</script>

<div class="flex flex-col" in:fade={{ duration: 200 }}>
  <button
    class="self-start text-[12px] opacity-40 hover:opacity-70 transition mb-6 bg-transparent border-none text-[#fafafa] disabled:opacity-20"
    onclick={onBack}
    disabled={phase === 'working'}
  >
    ← Back
  </button>

  {#if phase === 'ready'}
    <div class="mb-1 text-sm font-normal opacity-50">Open WebUI</div>
    <h1 class="text-2xl font-light tracking-tight mb-2">Install locally.</h1>
    <p class="text-[12px] opacity-30 mb-8 leading-relaxed">
      Download and run Open WebUI on this machine.
    </p>

    <button
      class="w-fit inline-flex items-center gap-2 bg-white px-8 py-2.5 text-black text-[13px] transition hover:bg-gray-100 border-none"
      onclick={install}
    >
      Continue
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </button>

  {:else if phase === 'working'}
    <div class="flex flex-col items-center gap-5 py-10" in:fade={{ duration: 250 }}>
      <img src={logoImage} class="size-12 rounded-full dark:invert" alt="logo" />
      <div class="flex flex-col items-center gap-2 text-center">
        <div class="text-sm opacity-60">Installing…</div>
        {#if $serverInfo?.status}
          <div class="text-[11px] opacity-30 max-w-[220px] leading-relaxed" in:fade={{ duration: 200 }}>
            {$serverInfo.status}
          </div>
        {:else}
          <div class="text-[11px] opacity-20">
            This might take a few minutes
          </div>
        {/if}
      </div>
    </div>

  {:else if phase === 'done'}
    <div class="flex flex-col items-center gap-4 py-10" in:fade={{ duration: 250 }}>
      <img src={logoImage} class="size-12 rounded-full dark:invert" alt="logo" />
      <div class="text-sm text-green-400 opacity-70">Ready</div>
    </div>

  {:else if phase === 'error'}
    <div class="flex flex-col items-center gap-4 py-10" in:fade={{ duration: 250 }}>
      <div class="text-[12px] text-red-400 opacity-80">{errorMsg}</div>
      <button
        class="w-fit inline-flex items-center gap-2 bg-white/[0.06] px-6 py-2 text-[12px] opacity-60 hover:opacity-90 transition border-none text-[#fafafa]"
        onclick={() => (phase = 'ready')}
      >
        Retry
      </button>
    </div>
  {/if}
</div>
