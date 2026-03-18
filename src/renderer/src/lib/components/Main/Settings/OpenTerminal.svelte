<script lang="ts">
  import { onMount } from 'svelte'
  import { config } from '../../../stores'
  import Switch from '../../common/Switch.svelte'

  let otInfo = $state<{ url?: string; apiKey?: string; status?: string; pid?: number } | null>(null)
  let otApiKeyCopied = $state(false)
  let version = $state<string | null>(null)
  let stopping = $state(false)
  let starting = $state(false)
  let restarting = $state(false)
  let updating = $state(false)
  let loaded = $state(false)
  let uninstalling = $state(false)
  let installing = $state(false)

  onMount(async () => {
    otInfo = await window.electronAPI.getOpenTerminalInfo()
    version = await window.electronAPI.getPackageVersion('open-terminal')
    loaded = true
  })

  const installed = $derived(version !== null)

  const isRunning = $derived(otInfo?.status === 'started')

  const updateOtConfig = async (key: string, value: any) => {
    const current = $config ?? {}
    const openTerminal = { ...(current.openTerminal ?? {}), [key]: value }
    await window.electronAPI.setConfig({ openTerminal })
    config.set(await window.electronAPI.getConfig())
  }

  const stopTerminal = async () => {
    stopping = true
    try {
      await window.electronAPI.stopOpenTerminal()
      otInfo = await window.electronAPI.getOpenTerminalInfo()
    } catch (e) {
      console.error('Failed to stop Open Terminal:', e)
    }
    stopping = false
  }

  const startTerminal = async () => {
    starting = true
    try {
      await window.electronAPI.startOpenTerminal()
      otInfo = await window.electronAPI.getOpenTerminalInfo()
    } catch (e) {
      console.error('Failed to start Open Terminal:', e)
    }
    starting = false
  }

  const restartTerminal = async () => {
    restarting = true
    try {
      await window.electronAPI.stopOpenTerminal()
      await window.electronAPI.startOpenTerminal()
      otInfo = await window.electronAPI.getOpenTerminalInfo()
    } catch (e) {
      console.error('Failed to restart Open Terminal:', e)
    }
    restarting = false
  }

  const updatePackage = async () => {
    updating = true
    try {
      if (isRunning) {
        await window.electronAPI.stopOpenTerminal()
      }
      // Reinstall to get latest
      await window.electronAPI.startOpenTerminal()
      otInfo = await window.electronAPI.getOpenTerminalInfo()
      version = await window.electronAPI.getPackageVersion('open-terminal')
    } catch (e) {
      console.error('Failed to update Open Terminal:', e)
    }
    updating = false
  }

  const copyOtApiKey = async () => {
    if (otInfo?.apiKey) {
      await navigator.clipboard.writeText(otInfo.apiKey)
      otApiKeyCopied = true
      setTimeout(() => { otApiKeyCopied = false }, 2000)
    }
  }
</script>

{#if !loaded}
  <div class="py-6 text-[12px] opacity-20 text-center">Loading…</div>
{:else if !installed}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-40">Not installed</div>
      <div class="text-[11px] opacity-20 mt-0.5">Enable terminal access for your AI models</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {installing ? 'pointer-events-none opacity-20' : ''}"
      disabled={installing}
      onclick={async () => {
        installing = true
        try {
          await window.electronAPI.startOpenTerminal()
          otInfo = await window.electronAPI.getOpenTerminalInfo()
          version = await window.electronAPI.getPackageVersion('open-terminal')
        } catch (e) {
          console.error('Failed to install:', e)
        }
        installing = false
      }}
    >
      {#if installing}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
        Installing…
      {:else}
        Install
      {/if}
    </button>
  </div>
{:else}
<div class="flex flex-col divide-y divide-white/[0.04]">
  <!-- Server status & controls -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70">Server</div>
        <div class="text-[11px] opacity-25 mt-0.5">
          {#if version}v{version} ·{/if} Open Terminal instance
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        {#if isRunning}
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span class="text-[12px] opacity-50">Running</span>
        {:else if otInfo?.status === 'stopped' || !otInfo?.status}
          <div class="w-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20"></div>
          <span class="text-[12px] opacity-30">Stopped</span>
        {:else}
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60"></div>
          <span class="text-[12px] opacity-30 capitalize">{otInfo?.status}</span>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if isRunning}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {stopping ? 'pointer-events-none opacity-20' : ''}"
          disabled={stopping}
          onclick={stopTerminal}
        >
          {#if stopping}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            Stopping…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
            </svg>
            Stop
          {/if}
        </button>
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {restarting ? 'pointer-events-none opacity-20' : ''}"
          disabled={restarting}
          onclick={restartTerminal}
        >
          {#if restarting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            Restarting…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
            </svg>
            Restart
          {/if}
        </button>
      {:else}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {starting ? 'pointer-events-none opacity-20' : ''}"
          disabled={starting}
          onclick={startTerminal}
        >
          {#if starting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
            Starting…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
            Start
          {/if}
        </button>
      {/if}

      <button
        class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {updating ? 'pointer-events-none opacity-20' : ''}"
        disabled={updating}
        onclick={updatePackage}
      >
        {#if updating}
          <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
          Updating…
        {:else}
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Update
        {/if}
      </button>
    </div>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Start on launch</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        Automatically start Open Terminal when app opens
      </div>
    </div>
    <Switch
      checked={$config?.openTerminal?.enabled ?? false}
      label="Toggle auto-start Open Terminal"
      onchange={(value) => updateOtConfig('enabled', value)}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Port</div>
      <div class="text-[11px] opacity-25 mt-0.5">Server port for Open Terminal</div>
    </div>
    <input
      type="number"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-20 text-right"
      value={$config?.openTerminal?.port ?? 8000}
      onchange={(e) =>
        updateOtConfig('port', parseInt((e.target as HTMLInputElement).value) || 8000)}
    />
  </div>

  <div class="py-4 flex items-center justify-between gap-4">
    <div class="shrink-0">
      <div class="text-[13px] opacity-70">Working Directory</div>
      <div class="text-[11px] opacity-25 mt-0.5">Starting directory for terminal sessions</div>
    </div>
    <div class="flex items-center gap-1.5 min-w-0 flex-1 max-w-[280px] justify-end">
      <input
        type="text"
        class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 min-w-0 flex-1 text-right font-mono"
        placeholder="~ (default)"
        value={$config?.openTerminal?.cwd ?? ''}
        onchange={(e) =>
          updateOtConfig('cwd', (e.target as HTMLInputElement).value.trim())}
      />
      <button
        class="shrink-0 text-[12px] opacity-40 hover:opacity-70 px-2.5 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
        onclick={async () => {
          const folder = await window.electronAPI.selectFolder()
          if (folder) updateOtConfig('cwd', folder)
        }}
      >
        Browse
      </button>
    </div>
  </div>

  {#if isRunning && otInfo}
    <div class="py-4">
      <div class="text-[13px] opacity-70 mb-3">Running Instance</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">URL</span>
          <span class="text-[12px] opacity-50 font-mono">{otInfo.url}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">API Key</span>
          <div class="flex items-center gap-1.5">
            <span class="text-[12px] opacity-50 font-mono">{otInfo.apiKey?.slice(0, 12)}…</span>
            <button
              class="text-[10px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]" 
              onclick={copyOtApiKey}
            >
              {otApiKeyCopied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Uninstall -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Uninstall</div>
      <div class="text-[11px] opacity-25 mt-0.5">Remove Open Terminal package</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {uninstalling ? 'pointer-events-none opacity-20' : ''}"
      disabled={uninstalling}
      onclick={async () => {
        if (confirm('This will stop Open Terminal and remove the package. Continue?')) {
          uninstalling = true
          try {
            if (isRunning) await window.electronAPI.stopOpenTerminal()
            await window.electronAPI.uninstallPackage('open-terminal')
            version = null
            otInfo = null
          } catch (e) {
            console.error('Failed to uninstall:', e)
          }
          uninstalling = false
        }
      }}
    >
      {#if uninstalling}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
        Uninstalling…
      {:else}
        Uninstall
      {/if}
    </button>
  </div>
</div>
{/if}
