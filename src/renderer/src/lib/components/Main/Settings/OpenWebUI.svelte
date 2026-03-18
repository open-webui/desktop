<script lang="ts">
  import { onMount } from 'svelte'
  import { config, serverInfo } from '../../../stores'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  let serverStatus = $state<string | null>(null)
  let updating = $state(false)
  let stopping = $state(false)
  let starting = $state(false)
  let restarting = $state(false)
  let version = $state<string | null>(null)
  let serverPid = $state<number | null>(null)
  let loaded = $state(false)
  let defaultDataPath = $state('')

  onMount(async () => {
    const info = await window.electronAPI.getServerInfo()
    serverStatus = info?.status ?? null
    serverPid = info?.pid ?? null
    version = await window.electronAPI.getPackageVersion('open-webui')
    defaultDataPath = await window.electronAPI.getDefaultDataPath()
    loaded = true
  })

  const installed = $derived(version !== null)

  const isRunning = $derived(
    serverStatus === 'running' || $serverInfo?.reachable === true
  )

  let uninstalling = $state(false)
  let installing = $state(false)

  const updateConfig = async (key: string, value: any) => {
    const current = $config ?? {}
    const localServer = { ...(current.localServer ?? {}), [key]: value }
    await window.electronAPI.setConfig({ localServer })
    config.set(await window.electronAPI.getConfig())
  }

  const stopServer = async () => {
    stopping = true
    try {
      await window.electronAPI.stopServer()
      serverStatus = 'stopped'
    } catch (e) {
      console.error('Failed to stop server:', e)
    }
    stopping = false
  }

  const startServer = async () => {
    starting = true
    try {
      await window.electronAPI.startServer()
      serverStatus = 'running'
    } catch (e) {
      console.error('Failed to start server:', e)
    }
    starting = false
  }

  const restartServer = async () => {
    restarting = true
    try {
      await window.electronAPI.restartServer()
      serverStatus = 'running'
    } catch (e) {
      console.error('Failed to restart server:', e)
    }
    restarting = false
  }

  const updatePackage = async () => {
    updating = true
    try {
      if (isRunning) {
        await window.electronAPI.stopServer()
        serverStatus = 'stopped'
      }
      await window.electronAPI.installPackage()
      await window.electronAPI.startServer()
      serverStatus = 'running'
      version = await window.electronAPI.getPackageVersion('open-webui')
    } catch (e) {
      console.error('Failed to update:', e)
    }
    updating = false
  }
</script>

{#if !loaded}
  <div class="py-6 text-[12px] opacity-20 text-center">{$i18n.t('common.loading')}</div>
{:else if !installed}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-40">{$i18n.t('settings.openwebui.notInstalled')}</div>
      <div class="text-[11px] opacity-20 mt-0.5">{$i18n.t('settings.openwebui.notInstalledDesc')}</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {installing ? 'pointer-events-none opacity-20' : ''}"
      disabled={installing}
      onclick={async () => {
        installing = true
        try {
          await window.electronAPI.installPackage()
          version = await window.electronAPI.getPackageVersion('open-webui')
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
{:else}
<div class="flex flex-col divide-y divide-white/[0.04]">
  <!-- Server status & controls -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.server')}</div>
        <div class="text-[11px] opacity-25 mt-0.5">
          {#if version}v{version} · {/if}{$i18n.t('settings.openwebui.localInstance')}
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        {#if isRunning}
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span class="text-[12px] opacity-50">{$i18n.t('common.running')}</span>
        {:else if serverStatus === 'stopped'}
          <div class="w-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20"></div>
          <span class="text-[12px] opacity-30">{$i18n.t('common.stopped')}</span>
        {:else}
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60"></div>
          <span class="text-[12px] opacity-30 capitalize">{serverStatus ?? $i18n.t('common.unknown')}</span>
        {/if}
      </div>
    </div>

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
        class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {updating ? 'pointer-events-none opacity-20' : ''}"
        disabled={updating}
        onclick={updatePackage}
      >
        {#if updating}
          <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"></div>
          {$i18n.t('common.updating')}
        {:else}
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {$i18n.t('common.update')}
        {/if}
      </button>
    </div>
  </div>

  <!-- Running Instance Info -->
  {#if isRunning}
    <div class="py-4">
      <div class="text-[13px] opacity-70 mb-3">{$i18n.t('settings.openwebui.runningInstance')}</div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">URL</span>
          <button class="text-[12px] opacity-50 font-mono hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 underline decoration-dotted underline-offset-2 cursor-pointer" onclick={() => window.open($serverInfo?.url ?? 'http://127.0.0.1:8080')}>{$serverInfo?.url ?? 'http://127.0.0.1:8080'}</button>
        </div>
        {#if serverPid}
        <div class="flex items-center justify-between">
          <span class="text-[11px] opacity-30">PID</span>
          <span class="text-[12px] opacity-50 font-mono">{serverPid}</span>
        </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.startOnLaunch')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {$i18n.t('settings.openwebui.startOnLaunchDesc')}
      </div>
    </div>
    <Switch
      checked={$config?.localServer?.enabled !== false}
      label="Toggle start on launch"
      onchange={(value) => updateConfig('enabled', value)}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.serverPort')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.openwebui.serverPortDesc')}</div>
    </div>
    <input
      type="number"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-20 text-right"
      value={$config?.localServer?.port ?? 8080}
      onchange={(e) =>
        updateConfig('port', parseInt((e.target as HTMLInputElement).value) || 8080)}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.serveOnLocalNetwork')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {$i18n.t('settings.openwebui.serveOnLocalNetworkDesc')}
      </div>
    </div>
    <Switch
      checked={$config?.localServer?.serveOnLocalNetwork ?? false}
      label="Toggle serve on local network"
      onchange={(value) => updateConfig('serveOnLocalNetwork', value)}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.autoUpdate')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {$i18n.t('settings.openwebui.autoUpdateDesc')}
      </div>
    </div>
    <Switch
      checked={$config?.localServer?.autoUpdate !== false}
      label="Toggle auto-update"
      onchange={(value) => updateConfig('autoUpdate', value)}
    />
  </div>

  <!-- Version Pin -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.version')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.openwebui.versionDesc')}</div>
    </div>
    <input
      type="text"
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-28 text-right font-mono"
      placeholder="latest"
      value={$config?.localServer?.version ?? ''}
      onchange={(e) => updateConfig('version', (e.target as HTMLInputElement).value.trim())}
    />
  </div>

  <div class="py-4 flex items-center justify-between gap-4">
    <div class="shrink-0">
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.dataLocation')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.openwebui.dataLocationDesc')}</div>
    </div>
    <div class="flex items-center gap-1.5 min-w-0 flex-1 max-w-[280px] justify-end">
      <input
        type="text"
        class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 min-w-0 flex-1 text-right font-mono"
        placeholder={defaultDataPath || 'Default'}
        value={$config?.dataDir ?? ''}
        onchange={async (e) => {
          const val = (e.target as HTMLInputElement).value.trim()
          await window.electronAPI.setConfig({ dataDir: val })
          config.set(await window.electronAPI.getConfig())
        }}
      />
      <button
        class="shrink-0 text-[12px] opacity-40 hover:opacity-70 px-2.5 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
        onclick={async () => {
          const folder = await window.electronAPI.selectFolder()
          if (folder) {
            await window.electronAPI.setConfig({ dataDir: folder })
            config.set(await window.electronAPI.getConfig())
          }
        }}
      >
        {$i18n.t('common.browse')}
      </button>
    </div>
  </div>

  <!-- Uninstall -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.openwebui.uninstall')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.openwebui.uninstallDesc')}</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {uninstalling ? 'pointer-events-none opacity-20' : ''}"
      disabled={uninstalling}
      onclick={async () => {
        if (confirm($i18n.t('settings.openwebui.uninstallConfirm'))) {
          uninstalling = true
          try {
            if (isRunning) await window.electronAPI.stopServer()
            await window.electronAPI.uninstallPackage('open-webui')
            version = null
          } catch (e) {
            console.error('Failed to uninstall:', e)
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
</div>
{/if}
