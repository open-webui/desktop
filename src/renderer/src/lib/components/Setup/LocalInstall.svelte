<script lang="ts">
  import { fade, fly } from 'svelte/transition'
  import { onMount } from 'svelte'
  import { connections, config, serverInfo } from '../../stores'
  import i18n from '../../i18n'

  import logoImage from '../../assets/images/splash.png'

  let { onBack, onComplete, autoStart = false } = $props()

  let phase = $state(autoStart ? 'working' : 'ready') // ready | working | done | error
  let errorMsg = $state('')
  let installDir = $state('')
  let defaultInstallDir = $state('')

  onMount(async () => {
    defaultInstallDir = await window.electronAPI.getInstallDir()
    installDir = defaultInstallDir
    if (autoStart) install()
  })

  const install = async () => {
    phase = 'working'
    try {
      // Save custom install directory before installing
      if (installDir && installDir !== defaultInstallDir) {
        await window.electronAPI.setConfig({ installDir })
      }

      const ok = await window.electronAPI.installPackage()
      if (!ok) { phase = 'error'; errorMsg = $i18n.t('setup.install.failed'); return }

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
      errorMsg = e?.message || $i18n.t('setup.install.somethingWentWrong')
    }
  }

  const changeInstallDir = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      installDir = folder
    }
  }
</script>

<div class="flex flex-col" in:fade={{ duration: 200 }}>
  <button
    class="self-start text-[12px] opacity-40 hover:opacity-70 transition mb-6 bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] disabled:opacity-20"
    onclick={onBack}
    disabled={phase === 'working'}
  >
    {$i18n.t('common.back')}
  </button>

  {#if phase === 'ready'}
    <div class="mb-1 text-sm font-normal opacity-50">{$i18n.t('app.name')}</div>
    <h1 class="text-2xl font-light tracking-tight mb-2">{$i18n.t('setup.install.title')}</h1>
    <p class="text-[12px] opacity-30 mb-6 leading-relaxed">
      {$i18n.t('setup.install.description')}
    </p>

    <!-- Install location -->
    <div class="mb-6">
      <div class="text-[11px] opacity-40 mb-1.5">{$i18n.t('setup.install.installLocation')}</div>
      <div class="flex items-center gap-2">
        <div
          class="flex-1 min-w-0 px-3 py-2 bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] opacity-50 font-mono truncate rounded-lg"
          title={installDir}
        >
          {installDir || '…'}
        </div>
        <button
          class="shrink-0 text-[11px] opacity-40 hover:opacity-70 px-2.5 py-2 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-lg"
          onclick={changeInstallDir}
        >
          {$i18n.t('setup.install.changeLocation')}
        </button>
      </div>
      <div class="text-[10px] opacity-20 mt-1">{$i18n.t('setup.install.installLocationDesc')}</div>
    </div>

    <button
      class="w-fit inline-flex items-center gap-2 bg-white px-8 py-2.5 text-black text-[13px] transition hover:bg-gray-100 border-none"
      onclick={install}
    >
      {$i18n.t('setup.install.continue')}
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    </button>

  {:else if phase === 'working'}
    <div class="flex flex-col items-center gap-5 py-10" in:fade={{ duration: 250 }}>
      <img src={logoImage} class="size-12 rounded-full dark:invert" alt="logo" />
      <div class="flex flex-col items-center gap-2 text-center">
        <div class="text-sm opacity-60">{$i18n.t('setup.install.installing')}</div>
        {#if $serverInfo?.status}
          <div class="text-[11px] opacity-30 max-w-[220px] leading-relaxed" in:fade={{ duration: 200 }}>
            {$serverInfo.status}
          </div>
        {:else}
          <div class="text-[11px] opacity-20">
            {$i18n.t('setup.install.mightTakeMinutes')}
          </div>
        {/if}
      </div>
    </div>

  {:else if phase === 'done'}
    <div class="flex flex-col items-center gap-4 py-10" in:fade={{ duration: 250 }}>
      <img src={logoImage} class="size-12 rounded-full dark:invert" alt="logo" />
      <div class="text-sm text-green-400 opacity-70">{$i18n.t('common.ready')}</div>
    </div>

  {:else if phase === 'error'}
    <div class="flex flex-col items-center gap-4 py-10" in:fade={{ duration: 250 }}>
      <div class="text-[12px] text-red-400 opacity-80">{errorMsg}</div>
      <button
        class="w-fit inline-flex items-center gap-2 bg-black/[0.04] dark:bg-white/[0.06] px-6 py-2 text-[12px] opacity-60 hover:opacity-90 transition border-none text-[#1d1d1f] dark:text-[#fafafa]"
        onclick={() => (phase = 'ready')}
      >
        {$i18n.t('common.retry')}
      </button>
    </div>
  {/if}
</div>
