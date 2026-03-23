<script lang="ts">
  import { onMount } from 'svelte'
  import { config } from '../../../stores'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  let lsInfo = $state<{ url?: string; status?: string; pid?: number; binaryPath?: string } | null>(null)
  let stopping = $state(false)
  let starting = $state(false)
  let restarting = $state(false)
  let settingUp = $state(false)
  let loaded = $state(false)
  let setupStatus = $state('')
  let uninstalling = $state(false)
  let installing = $state(false)

  type UpdateStatus = 'idle' | 'checking' | 'available' | 'updating' | 'up-to-date' | 'error'
  let updateStatus = $state<UpdateStatus>('idle')
  let updateInfo = $state<{ currentVersion: string | null; latestVersion: string | null; updateAvailable: boolean } | null>(null)
  let updateError = $state<string | null>(null)


  onMount(async () => {
    lsInfo = await window.electronAPI.getLlamaCppInfo()
    loaded = true

    window.electronAPI.onData((data: any) => {
      if (data.type === 'status:llamacpp') {
        lsInfo = { ...lsInfo, status: data.data }
      }
      if (data.type === 'status:llamacpp-setup') {
        setupStatus = data.data ?? ''
      }
      if (data.type === 'llamacpp:ready') {
        lsInfo = { ...lsInfo, ...data.data, status: 'started' }
      }
    })
  })

  const isRunning = $derived(lsInfo?.status === 'started')

  const updateConfig = async (key: string, value: any) => {
    const current = $config ?? {}
    const llamaCpp = { ...(current.llamaCpp ?? {}), [key]: value }
    await window.electronAPI.setConfig({ llamaCpp })
    config.set(await window.electronAPI.getConfig())
  }

  const platform = $derived((() => {
    const info = navigator.userAgent
    if (info.includes('Mac')) return 'darwin'
    if (info.includes('Win')) return 'win32'
    return 'linux'
  })())

  const variantOptions = $derived((() => {
    const autoOption = { value: 'auto', label: $i18n.t('settings.inference.variantAuto') }
    if (platform === 'darwin') return [autoOption, { value: 'cpu', label: $i18n.t('settings.inference.variantDefaultMetal') }]
    if (platform === 'win32') return [
      autoOption,
      { value: 'cpu', label: $i18n.t('settings.inference.variantCPU') },
      { value: 'cuda-12.4', label: 'CUDA 12.4' },
      { value: 'cuda-13.1', label: 'CUDA 13.1' },
      { value: 'vulkan', label: 'Vulkan' }
    ]
    return [
      autoOption,
      { value: 'cpu', label: $i18n.t('settings.inference.variantCPU') },
      { value: 'vulkan', label: 'Vulkan' },
      { value: 'rocm', label: 'ROCm' }
    ]
  })())

  const setupServer = async () => {
    settingUp = true
    setupStatus = ''
    try {
      await window.electronAPI.setupLlamaCpp()
      lsInfo = await window.electronAPI.getLlamaCppInfo()
    } catch (e) {
      console.error('Failed to setup llama-server:', e)
    }
    settingUp = false
    setupStatus = ''
  }

  const startServer = async () => {
    starting = true
    setupStatus = ''
    try {
      const result = await window.electronAPI.startLlamaCpp()
      lsInfo = await window.electronAPI.getLlamaCppInfo()
    } catch (e) {
      console.error('Failed to start llama-server:', e)
    }
    starting = false
    setupStatus = ''
  }

  const stopServer = async () => {
    stopping = true
    try {
      await window.electronAPI.stopLlamaCpp()
      lsInfo = await window.electronAPI.getLlamaCppInfo()
    } catch (e) {
      console.error('Failed to stop llama-server:', e)
    }
    stopping = false
  }

  const restartServer = async () => {
    restarting = true
    try {
      await window.electronAPI.stopLlamaCpp()
      await window.electronAPI.startLlamaCpp()
      lsInfo = await window.electronAPI.getLlamaCppInfo()
    } catch (e) {
      console.error('Failed to restart llama-server:', e)
    }
    restarting = false
  }

  const checkUpdate = async () => {
    updateStatus = 'checking'
    updateError = null
    try {
      const res = await window.electronAPI.checkLlamaCppUpdate()
      updateInfo = res
      updateStatus = res.updateAvailable ? 'available' : 'up-to-date'
    } catch (e: any) {
      updateStatus = 'error'
      updateError = e?.message ?? 'Check failed'
    }
  }

  const doUpdate = async () => {
    updateStatus = 'updating'
    try {
      lsInfo = await window.electronAPI.updateLlamaCpp()
      updateStatus = 'idle'
      updateInfo = null
    } catch (e: any) {
      updateStatus = 'error'
      updateError = e?.message ?? 'Update failed'
    }
  }

  const downloadModel = async () => {
    if (!downloadRepo.trim() || !downloadFile.trim()) return
    downloading = true
    downloadProgress = 0
    try {
      await window.electronAPI.downloadHfModel(downloadRepo.trim(), downloadFile.trim())
    } catch (e) {
      console.error('Failed to download model:', e)
      downloading = false
    }
  }

  const removeModel = async (repo: string, filename: string) => {
    deleting = `${repo}/${filename}`
    try {
      await window.electronAPI.deleteHfModel(repo, filename)
      models = await window.electronAPI.listHfModels()
    } catch (e) {
      console.error('Failed to delete model:', e)
    }
    deleting = null
  }

  const installed = $derived(!!lsInfo?.binaryPath)

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
</script>

{#if !loaded}
  <div class="py-6 text-[12px] opacity-20 text-center">{$i18n.t('common.loading')}</div>
{:else if !installed}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-40 flex items-center gap-1.5">
        {$i18n.t('settings.inference.notInstalled')}
        <span class="text-[9px] opacity-30 uppercase tracking-wide">{$i18n.t('common.experimental')}</span>
      </div>
      <div class="text-[11px] opacity-20 mt-0.5">{$i18n.t('settings.inference.notInstalledDesc')}</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {installing ? 'pointer-events-none opacity-20' : ''}"
      disabled={installing}
      onclick={async () => {
        installing = true
        try {
          await window.electronAPI.startLlamaCpp()
          lsInfo = await window.electronAPI.getLlamaCppInfo()
        } catch (e) {
          console.error('Failed to install:', e)
        }
        installing = false
      }}
    >
      {#if installing}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
        {$i18n.t('common.installing')}
      {:else}
        {$i18n.t('common.install')}
      {/if}
    </button>
  </div>

  <!-- Version -->
  <div class="py-4 flex items-center justify-between border-t border-white/[0.04]">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.version')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.versionDesc')}</div>
    </div>
    <input
      type="text"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-24 text-right font-mono"
      value={$config?.llamaCpp?.version ?? 'latest'}
      onchange={(e) => updateConfig('version', (e.target as HTMLInputElement).value.trim() || 'latest')}
    />
  </div>

  <!-- Variant -->
  <div class="py-4 flex items-center justify-between border-t border-white/[0.04]">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.variant')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.variantDesc')}</div>
    </div>
    <select
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
      onchange={(e) => updateConfig('variant', (e.target as HTMLSelectElement).value)}
    >
      {#each variantOptions as opt}
        <option value={opt.value} selected={($config?.llamaCpp?.variant ?? 'auto') === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>
{:else}
<div class="flex flex-col divide-y divide-white/[0.04]">
  <!-- Server status & controls -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70 flex items-center gap-1.5">
          {$i18n.t('settings.inference.llamaServer')}
          <span class="text-[9px] opacity-30 uppercase tracking-wide">{$i18n.t('common.experimental')}</span>
        </div>
        <div class="text-[11px] opacity-25 mt-0.5">
          {$i18n.t('settings.inference.llamaServerDesc')}
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        {#if isRunning}
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span class="text-[12px] opacity-50">{$i18n.t('common.running')}</span>
        {:else if lsInfo?.status === 'starting' || lsInfo?.status === 'setting-up'}
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse"></div>
          <span class="text-[12px] opacity-30 capitalize">{lsInfo?.status === 'setting-up' ? $i18n.t('settings.inference.settingUp') : $i18n.t('common.starting')}</span>
        {:else if lsInfo?.status === 'failed'}
          <div class="w-1.5 h-1.5 rounded-full bg-red-400/70"></div>
          <span class="text-[12px] opacity-30">{$i18n.t('common.failed')}</span>
        {:else}
          <div class="w-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20"></div>
          <span class="text-[12px] opacity-30">{$i18n.t('common.stopped')}</span>
        {/if}
      </div>
    </div>

    {#if setupStatus}
      <div class="text-[11px] opacity-30 mb-3 font-mono truncate">{setupStatus}</div>
    {/if}

    <div class="flex items-center gap-2">
      {#if isRunning}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {stopping ? 'pointer-events-none opacity-20' : ''}"
          disabled={stopping}
          onclick={stopServer}
        >
          {#if stopping}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            {$i18n.t('common.stopping')}
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
            </svg>
            {$i18n.t('common.stop')}
          {/if}
        </button>
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {restarting ? 'pointer-events-none opacity-20' : ''}"
          disabled={restarting}
          onclick={restartServer}
        >
          {#if restarting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            {$i18n.t('common.restarting')}
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
            </svg>
            {$i18n.t('common.restart')}
          {/if}
        </button>
      {:else}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {starting ? 'pointer-events-none opacity-20' : ''}"
          disabled={starting}
          onclick={startServer}
        >
          {#if starting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            {$i18n.t('common.starting')}
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
            {$i18n.t('common.start')}
          {/if}
        </button>
      {/if}

      <button
        class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {settingUp ? 'pointer-events-none opacity-20' : ''}"
        disabled={settingUp}
        onclick={setupServer}
      >
        {#if settingUp}
          <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
          {$i18n.t('common.downloading')}
        {:else}
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {lsInfo?.binaryPath ? $i18n.t('settings.inference.redownload') : $i18n.t('common.download')}
        {/if}
      </button>
    </div>
  </div>

  <!-- Running Instance Info -->
  {#if isRunning && lsInfo}
    <div class="py-4">
      <div class="text-[13px] opacity-70 mb-3">{$i18n.t('settings.inference.runningInstance')}</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">URL</span>
          <button class="text-[12px] opacity-50 font-mono hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 underline decoration-dotted underline-offset-2 cursor-pointer" onclick={() => window.open(lsInfo.url)}>{lsInfo.url}</button>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">PID</span>
          <span class="text-[12px] opacity-50 font-mono">{lsInfo.pid}</span>
        </div>
        {#if lsInfo.version}
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">{$i18n.t('settings.inference.build')}</span>
          <span class="text-[12px] opacity-50 font-mono">{lsInfo.version}</span>
        </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Update Section -->
  <div class="py-4">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[13px] opacity-70">{$i18n.t('settings.about.softwareUpdate')}</div>
        {#if updateStatus === 'up-to-date'}
          <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.upToDate')}</div>
        {:else if updateStatus === 'available' && updateInfo?.latestVersion}
          <div class="text-[11px] opacity-40 mt-0.5">{$i18n.t('settings.inference.updateAvailable', { version: updateInfo.latestVersion })}</div>
        {:else if updateStatus === 'updating'}
          <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.updating')}</div>
        {:else if updateStatus === 'error'}
          <div class="text-[11px] text-red-400/60 mt-0.5">{updateError}</div>
        {/if}
      </div>

      <div>
        {#if updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error'}
          <button
            class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
            onclick={checkUpdate}
          >
            {$i18n.t('settings.inference.checkForUpdates')}
          </button>
        {:else if updateStatus === 'checking'}
          <button
            class="text-[12px] opacity-30 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl pointer-events-none flex items-center gap-1.5"
            disabled
          >
            <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round" />
            </svg>
            {$i18n.t('settings.inference.checking')}
          </button>
        {:else if updateStatus === 'available'}
          <button
            class="text-[12px] opacity-50 hover:opacity-80 px-3 py-1.5 bg-black/[0.06] dark:bg-white/[0.08] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
            onclick={doUpdate}
          >
            {$i18n.t('common.update')}
          </button>
        {:else if updateStatus === 'updating'}
          <button
            class="text-[12px] opacity-30 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl pointer-events-none flex items-center gap-1.5"
            disabled
          >
            <div class="w-2.5 h-2.5 rounded-full border-2 border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            {$i18n.t('common.updating')}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Start on Launch -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.startOnLaunch')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.startOnLaunchDesc')}</div>
    </div>
    <Switch
      checked={$config?.llamaCpp?.enabled ?? false}
      onToggle={() => updateConfig('enabled', !($config?.llamaCpp?.enabled ?? false))}
    />
  </div>

  <!-- Version -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.version')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.versionDesc')}</div>
    </div>
    <input
      type="text"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-24 text-right font-mono"
      value={$config?.llamaCpp?.version ?? 'latest'}
      onchange={(e) => updateConfig('version', (e.target as HTMLInputElement).value.trim() || 'latest')}
    />
  </div>

  <!-- Variant -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.variant')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.variantDesc')}</div>
    </div>
    <select
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
      onchange={(e) => updateConfig('variant', (e.target as HTMLSelectElement).value)}
    >
      {#each variantOptions as opt}
        <option value={opt.value} selected={($config?.llamaCpp?.variant ?? 'auto') === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  <!-- Port -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.port')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.portDesc')}</div>
    </div>
    <input
      type="number"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-20 text-right"
      value={$config?.llamaCpp?.port ?? 18881}
      onchange={(e) => updateConfig('port', parseInt((e.target as HTMLInputElement).value) || 18881)}
    />
  </div>

  <!-- Extra Arguments -->
  <div class="py-4 flex items-center justify-between gap-4">
    <div class="shrink-0">
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.extraArguments')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.extraArgumentsDesc')}</div>
    </div>
    <input
      type="text"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 min-w-0 flex-1 max-w-[280px] text-right font-mono"
      placeholder={$i18n.t('settings.inference.extraArgumentsPlaceholder')}
      value={($config?.llamaCpp?.extraArgs ?? []).join(' ')}
      onchange={(e) => {
        const val = (e.target as HTMLInputElement).value.trim()
        updateConfig('extraArgs', val ? val.split(/\s+/) : [])
      }}
    />
  </div>

  <!-- Uninstall -->
  {#if lsInfo?.binaryPath}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.inference.uninstall')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.inference.uninstallDesc')}</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {uninstalling ? 'pointer-events-none opacity-20' : ''}"
      disabled={uninstalling}
      onclick={async () => {
        if (confirm($i18n.t('settings.inference.uninstallConfirm'))) {
          uninstalling = true
          try {
            await window.electronAPI.uninstallLlamaCpp()
            lsInfo = await window.electronAPI.getLlamaCppInfo()
          } catch (e) {
            console.error('Failed to uninstall llama.cpp:', e)
          }
          uninstalling = false
        }
      }}
    >
      {#if uninstalling}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
        {$i18n.t('common.uninstalling')}
      {:else}
        {$i18n.t('common.uninstall')}
      {/if}
    </button>
  </div>
  {/if}

</div>
{/if}
