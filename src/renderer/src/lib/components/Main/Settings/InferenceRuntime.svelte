<script lang="ts">
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import DownloadIcon from 'iconoir/icons/download.svg?raw'
  import PlayIcon from 'iconoir/icons/play.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import RestartIcon from 'iconoir/icons/restart.svg?raw'
  import SquareIcon from 'iconoir/icons/square.svg?raw'
  import { onMount, onDestroy } from 'svelte'
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


  let unsubscribe: (() => void) | undefined
  onDestroy(() => unsubscribe?.())
  onMount(async () => {
    lsInfo = await window.electronAPI.getLlamaCppInfo()
    loaded = true

    unsubscribe = window.electronAPI.onData((data: any) => {
      if (data.type === 'llamacpp:info') lsInfo = { ...lsInfo, ...data.data }
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
  <div class="py-6 text-[12px] text-center">{$i18n.t('common.loading')}</div>
{:else if !installed}
  <div class="flex flex-col gap-4">
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
          {$i18n.t('settings.inference.notInstalled')}
          <span class="text-[10px] text-gray-600 dark:text-gray-400">{$i18n.t('common.experimental')}</span>
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.notInstalledDesc')}
        </div>
      </div>
      <button
        class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {installing
          ? 'pointer-events-none opacity-50'
          : ''}"
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
          <span
            aria-hidden="true"
            class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
            >{@html RefreshIcon}</span
          >
          {$i18n.t('common.installing')}
        {:else}
          {$i18n.t('common.install')}
        {/if}
      </button>
    </div>

    <!-- Version -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.version')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.versionDesc')}
        </div>
      </div>
      <input
        type="text"
        class="placeholder:text-gray-600 dark:placeholder:text-gray-400 min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 w-24 text-right font-mono"
        value={$config?.llamaCpp?.version ?? 'latest'}
        onchange={(e) =>
          updateConfig('version', (e.target as HTMLInputElement).value.trim() || 'latest')}
      />
    </div>

    <!-- Variant -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.variant')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.variantDesc')}
        </div>
      </div>
      <div class="relative inline-flex max-w-full">
        <select
          class="w-full min-w-[100px] appearance-none text-ellipsis pr-[30px] min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={$i18n.t('settings.inference.variant')}
          onchange={(e) => updateConfig('variant', (e.target as HTMLSelectElement).value)}
        >
          {#each variantOptions as opt}
            <option
              value={opt.value}
              selected={($config?.llamaCpp?.variant ?? 'auto') === opt.value}>{opt.label}</option
            >
          {/each}
        </select>
        <span
          aria-hidden="true"
          class="inline-flex shrink-0 [&>svg]:size-full pointer-events-none absolute right-2 top-1/2 size-[14px] -translate-y-1/2 text-gray-600 dark:text-gray-400"
          >{@html NavArrowDownIcon}</span
        >
      </div>
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    <!-- Server status & controls -->
    <div class="pt-1">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-[12px] text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
            {$i18n.t('settings.inference.llamaServer')}
            <span class="text-[10px] text-gray-600 dark:text-gray-400">{$i18n.t('common.experimental')}</span>
          </div>
          <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
            {$i18n.t('settings.inference.llamaServerDesc')}
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          {#if isRunning}
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
            <span class="text-[12px]">{$i18n.t('common.running')}</span>
          {:else if lsInfo?.status === 'starting' || lsInfo?.status === 'setting-up'}
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse"></div>
            <span class="text-[12px] capitalize"
              >{lsInfo?.status === 'setting-up'
                ? $i18n.t('settings.inference.settingUp')
                : $i18n.t('common.starting')}</span
            >
          {:else if lsInfo?.status === 'failed'}
            <div class="w-1.5 h-1.5 rounded-full bg-red-400/70"></div>
            <span class="text-[12px]">{$i18n.t('common.failed')}</span>
          {:else}
            <div class="w-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20"></div>
            <span class="text-[12px]">{$i18n.t('common.stopped')}</span>
          {/if}
        </div>
      </div>

      {#if setupStatus}
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mb-3 font-mono truncate">
          {setupStatus}
        </div>
      {/if}

      <div class="flex items-center gap-2">
        {#if isRunning}
          <button
            class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {stopping
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={stopping}
            onclick={stopServer}
          >
            {#if stopping}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.stopping')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                >{@html SquareIcon}</span
              >
              {$i18n.t('common.stop')}
            {/if}
          </button>
          <button
            class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {restarting
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={restarting}
            onclick={restartServer}
          >
            {#if restarting}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.restarting')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                >{@html RestartIcon}</span
              >
              {$i18n.t('common.restart')}
            {/if}
          </button>
        {:else}
          <button
            class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {starting
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={starting}
            onclick={startServer}
          >
            {#if starting}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.starting')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                >{@html PlayIcon}</span
              >
              {$i18n.t('common.start')}
            {/if}
          </button>
        {/if}

        <button
          class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {settingUp
            ? 'pointer-events-none opacity-50'
            : ''}"
          disabled={settingUp}
          onclick={setupServer}
        >
          {#if settingUp}
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
              >{@html RefreshIcon}</span
            >
            {$i18n.t('common.downloading')}
          {:else}
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
              >{@html DownloadIcon}</span
            >
            {lsInfo?.binaryPath
              ? $i18n.t('settings.inference.redownload')
              : $i18n.t('common.download')}
          {/if}
        </button>
      </div>
    </div>

    <!-- Running Instance Info -->
    {#if isRunning && lsInfo}
      <div class="pt-1">
        <div class="text-[12px] text-gray-800 dark:text-gray-200 mb-3">
          {$i18n.t('settings.inference.runningInstance')}
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-[11px] leading-normal text-gray-600 dark:text-gray-400">URL</span>
            <button
              class="text-[12px] font-mono transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-0 underline decoration-dotted underline-offset-2 cursor-pointer"
              onclick={() => window.open(lsInfo.url)}>{lsInfo.url}</button
            >
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[11px] leading-normal text-gray-600 dark:text-gray-400">PID</span>
            <span class="text-[12px] font-mono">{lsInfo.pid}</span>
          </div>
          {#if lsInfo.version}
            <div class="flex items-center justify-between">
              <span class="text-[11px] leading-normal text-gray-600 dark:text-gray-400"
                >{$i18n.t('settings.inference.build')}</span
              >
              <span class="text-[12px] font-mono">{lsInfo.version}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Update Section -->
    <div class="pt-1">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-[12px] text-gray-800 dark:text-gray-200">
            {$i18n.t('settings.about.softwareUpdate')}
          </div>
          {#if updateStatus === 'up-to-date'}
            <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
              {$i18n.t('settings.inference.upToDate')}
            </div>
          {:else if updateStatus === 'available' && updateInfo?.latestVersion}
            <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
              {$i18n.t('settings.inference.updateAvailable', { version: updateInfo.latestVersion })}
            </div>
          {:else if updateStatus === 'updating'}
            <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
              {$i18n.t('settings.inference.updating')}
            </div>
          {:else if updateStatus === 'error'}
            <div class="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{updateError}</div>
          {/if}
        </div>

        <div>
          {#if updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error'}
            <button
              class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
              onclick={checkUpdate}
            >
              {$i18n.t('settings.inference.checkForUpdates')}
            </button>
          {:else if updateStatus === 'checking'}
            <button
              class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] pointer-events-none flex items-center gap-1.5"
              disabled
            >
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3 animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('settings.inference.checking')}
            </button>
          {:else if updateStatus === 'available'}
            <button
              class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06]"
              onclick={doUpdate}
            >
              {$i18n.t('common.update')}
            </button>
          {:else if updateStatus === 'updating'}
            <button
              class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] pointer-events-none flex items-center gap-1.5"
              disabled
            >
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.updating')}
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Start on Launch -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.startOnLaunch')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.startOnLaunchDesc')}
        </div>
      </div>
      <Switch
        checked={$config?.llamaCpp?.enabled ?? false}
        label={$i18n.t('settings.inference.startOnLaunch')}
        onchange={(value) => updateConfig('enabled', value)}
      />
    </div>

    <!-- Version -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.version')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.versionDesc')}
        </div>
      </div>
      <input
        type="text"
        class="placeholder:text-gray-600 dark:placeholder:text-gray-400 min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 w-24 text-right font-mono"
        value={$config?.llamaCpp?.version ?? 'latest'}
        onchange={(e) =>
          updateConfig('version', (e.target as HTMLInputElement).value.trim() || 'latest')}
      />
    </div>

    <!-- Variant -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.variant')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.variantDesc')}
        </div>
      </div>
      <div class="relative inline-flex max-w-full">
        <select
          class="w-full min-w-[100px] appearance-none text-ellipsis pr-[30px] min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={$i18n.t('settings.inference.variant')}
          onchange={(e) => updateConfig('variant', (e.target as HTMLSelectElement).value)}
        >
          {#each variantOptions as opt}
            <option
              value={opt.value}
              selected={($config?.llamaCpp?.variant ?? 'auto') === opt.value}>{opt.label}</option
            >
          {/each}
        </select>
        <span
          aria-hidden="true"
          class="inline-flex shrink-0 [&>svg]:size-full pointer-events-none absolute right-2 top-1/2 size-[14px] -translate-y-1/2 text-gray-600 dark:text-gray-400"
          >{@html NavArrowDownIcon}</span
        >
      </div>
    </div>

    <!-- Port -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div>
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.port')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.portDesc')}
        </div>
      </div>
      <input
        type="number"
        class="placeholder:text-gray-600 dark:placeholder:text-gray-400 min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 w-20 text-right"
        value={$config?.llamaCpp?.port ?? 18881}
        onchange={(e) =>
          updateConfig('port', parseInt((e.target as HTMLInputElement).value) || 18881)}
      />
    </div>

    <!-- Extra Arguments -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div class="min-w-0">
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.inference.extraArguments')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.inference.extraArgumentsDesc')}
        </div>
      </div>
      <input
        type="text"
        class="placeholder:text-gray-600 dark:placeholder:text-gray-400 min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 min-w-0 flex-1 max-w-[280px] text-right font-mono"
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
      <div
        class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
      >
        <div>
          <div class="text-[12px] text-gray-800 dark:text-gray-200">
            {$i18n.t('settings.inference.uninstall')}
          </div>
          <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
            {$i18n.t('settings.inference.uninstallDesc')}
          </div>
        </div>
        <button
          class="min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 shrink-0 hover:bg-gray-50 dark:hover:bg-white/[0.06] flex items-center gap-1.5 {uninstalling
            ? 'pointer-events-none opacity-50'
            : ''}"
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
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
              >{@html RefreshIcon}</span
            >
            {$i18n.t('common.uninstalling')}
          {:else}
            {$i18n.t('common.uninstall')}
          {/if}
        </button>
      </div>
    {/if}
  </div>
{/if}
