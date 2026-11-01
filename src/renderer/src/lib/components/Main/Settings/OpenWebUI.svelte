<script lang="ts">
  import DownloadIcon from 'iconoir/icons/download.svg?raw'
  import PlayIcon from 'iconoir/icons/play.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import RestartIcon from 'iconoir/icons/restart.svg?raw'
  import SquareIcon from 'iconoir/icons/square.svg?raw'
  import { onMount } from 'svelte'
  import { config, serverInfo } from '../../../stores'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  const serverStatus = $derived($serverInfo?.status ?? null)
  let updating = $state(false)
  let stopping = $state(false)
  let starting = $state(false)
  let restarting = $state(false)
  let version = $state<string | null>(null)
  const serverPid = $derived($serverInfo?.pid ?? null)
  let loaded = $state(false)
  let defaultDataPath = $state('')

  onMount(async () => {
    const info = await window.electronAPI.getServerInfo()
    serverInfo.set(info)
    version = await window.electronAPI.getPackageVersion('open-webui')
    defaultDataPath = await window.electronAPI.getDefaultDataPath()
    loaded = true
  })

  const installed = $derived(version !== null)

  const isRunning = $derived(
    serverStatus === 'started' || $serverInfo?.reachable === true
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
    } catch (e) {
      console.error('Failed to stop server:', e)
    }
    stopping = false
  }

  const startServer = async () => {
    starting = true
    try {
      await window.electronAPI.startServer()
    } catch (e) {
      console.error('Failed to start server:', e)
    }
    starting = false
  }

  const restartServer = async () => {
    restarting = true
    try {
      await window.electronAPI.restartServer()
    } catch (e) {
      console.error('Failed to restart server:', e)
    }
    restarting = false
  }

  const updatePackage = async () => {
    updating = true
    try {
      if (!(await window.electronAPI.installPackage())) return
      await window.electronAPI.startServer()
      version = await window.electronAPI.getPackageVersion('open-webui')
    } catch (e) {
      console.error('Failed to update:', e)
    } finally {
      updating = false
    }
  }
</script>

<div class="flex min-w-0 flex-col text-[#171717] dark:text-white">
{#if !loaded}
  <div class="py-6 text-[12px] text-center">{$i18n.t('common.loading')}</div>
{:else if !installed}
  <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.openwebui.notInstalled')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.openwebui.notInstalledDesc')}
      </div>
    </div>
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {installing
        ? 'pointer-events-none opacity-50'
        : ''}"
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
        <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
          >{@html RefreshIcon}</span
        >
        {$i18n.t('common.installing')}
      {:else}
        {$i18n.t('common.install')}
      {/if}
    </button>
  </div>
{:else}
  <div>
    <!-- Server status & controls -->
    <div class="mb-[4px] pb-[14px]">
      <div class="flex min-w-0 items-center justify-between gap-[16px] pb-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0">
        <div>
          <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
            {$i18n.t('settings.openwebui.server')}
          </div>
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {#if version}v{version} ·
            {/if}{$i18n.t('settings.openwebui.localInstance')}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-[8px] text-[11px] text-[#676767] dark:text-[#b4b4b4]">
          {#if isRunning}
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
            <span class="text-[12px]">{$i18n.t('common.running')}</span>
          {:else if serverStatus === 'stopped'}
            <div class="w-1.5 h-1.5 rounded-full bg-black/15 dark:bg-white/20"></div>
            <span class="text-[12px]">{$i18n.t('common.stopped')}</span>
          {:else}
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60"></div>
            <span class="text-[12px]">{$i18n.t(`common.${serverStatus ?? 'unknown'}`)}</span>
          {/if}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-[12px]">
        {#if isRunning}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {stopping
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={stopping}
            onclick={stopServer}
          >
            {#if stopping}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.stopping')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
                >{@html SquareIcon}</span
              >
              {$i18n.t('common.stop')}
            {/if}
          </button>
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {restarting
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={restarting}
            onclick={restartServer}
          >
            {#if restarting}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.restarting')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
                >{@html RestartIcon}</span
              >
              {$i18n.t('common.restart')}
            {/if}
          </button>
        {:else}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {starting
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={starting}
            onclick={startServer}
          >
            {#if starting}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
                >{@html RefreshIcon}</span
              >
              {$i18n.t('common.starting')}
            {:else}
              <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
                >{@html PlayIcon}</span
              >
              {$i18n.t('common.start')}
            {/if}
          </button>
        {/if}

        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {updating
            ? 'pointer-events-none opacity-50'
            : ''}"
          disabled={updating}
          onclick={updatePackage}
        >
          {#if updating}
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
              >{@html RefreshIcon}</span
            >
            {$i18n.t('common.updating')}
          {:else}
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
              >{@html DownloadIcon}</span
            >
            {$i18n.t('common.update')}
          {/if}
        </button>
      </div>
    </div>

    <!-- Running Instance Info -->
    {#if isRunning}
      <div class="mb-[4px] pb-[14px]">
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white mb-2">
          {$i18n.t('settings.openwebui.runningInstance')}
        </div>
        <div class="text-[11px] [&>div]:py-[4px] [&>div]:gap-[12px] max-sm:[&>div>:last-child]:max-w-[75%]">
          <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
            <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">{$i18n.t('common.url')}</span>
            <button
              class="min-w-0 [overflow-wrap:anywhere] text-right text-[11px] text-[#676767] transition-colors duration-150 hover:text-[#171717] dark:text-[#b4b4b4] dark:hover:text-white font-mono"
              onclick={() => window.open($serverInfo?.url ?? 'http://127.0.0.1:8080')}
              >{$serverInfo?.url ?? 'http://127.0.0.1:8080'}</button
            >
          </div>
          {#if serverPid}
            <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
              <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">{$i18n.t('common.processId')}</span>
              <span class="text-[12px] font-mono">{serverPid}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.startOnLaunch')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.startOnLaunchDesc')}
        </div>
      </div>
      <Switch
        checked={$config?.localServer?.enabled !== false}
        label={$i18n.t('settings.openwebui.toggleStartOnLaunch')}
        onchange={(value) => updateConfig('enabled', value)}
      />
    </div>

    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.serverPort')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.serverPortDesc')}
        </div>
      </div>
      <input
        type="number"
        class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-[88px]"
        aria-label={$i18n.t('settings.openwebui.serverPort')}
        value={$config?.localServer?.port ?? 8080}
        onchange={(e) =>
          updateConfig('port', parseInt((e.target as HTMLInputElement).value) || 8080)}
      />
    </div>

    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.serveOnLocalNetwork')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.serveOnLocalNetworkDesc')}
        </div>
      </div>
      <Switch
        checked={$config?.localServer?.serveOnLocalNetwork ?? false}
        label={$i18n.t('settings.openwebui.toggleServeOnLocalNetwork')}
        onchange={(value) => updateConfig('serveOnLocalNetwork', value)}
      />
    </div>

    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.autoUpdate')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.autoUpdateDesc')}
        </div>
      </div>
      <Switch
        checked={$config?.localServer?.autoUpdate !== false}
        label={$i18n.t('settings.openwebui.toggleAutoUpdate')}
        onchange={(value) => updateConfig('autoUpdate', value)}
      />
    </div>

    <!-- Version Pin -->
    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.version')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.versionDesc')}
        </div>
      </div>
      <input
        type="text"
        class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-[96px]"
        aria-label={$i18n.t('settings.openwebui.version')}
        placeholder={$i18n.t('common.latest')}
        value={$config?.localServer?.version ?? ''}
        onchange={(e) => updateConfig('version', (e.target as HTMLInputElement).value.trim())}
      />
    </div>

    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.dataLocation')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.dataLocationDesc')}
        </div>
      </div>
      <div class="flex min-w-[140px] flex-[0_1_280px] max-w-[280px] shrink! items-center gap-[6px]">
        <input
          type="text"
          class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] min-w-0 flex-1"
        aria-label={$i18n.t('settings.openwebui.dataLocation')}
          placeholder={defaultDataPath || $i18n.t('common.default')}
          value={$config?.dataDir ?? ''}
          onchange={async (e) => {
            const val = (e.target as HTMLInputElement).value.trim()
            await window.electronAPI.setConfig({ dataDir: val })
            config.set(await window.electronAPI.getConfig())
          }}
        />
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
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
    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%] mt-[10px] pt-[16px]!">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.openwebui.uninstall')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.openwebui.uninstallDesc')}
        </div>
      </div>
      <button
        class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {uninstalling
          ? 'pointer-events-none opacity-50'
          : ''}"
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
          <span
            aria-hidden="true"
            class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
            >{@html RefreshIcon}</span
          >
          {$i18n.t('common.uninstalling')}
        {:else}
          {$i18n.t('common.uninstall')}
        {/if}
      </button>
    </div>
  </div>
{/if}

</div>
