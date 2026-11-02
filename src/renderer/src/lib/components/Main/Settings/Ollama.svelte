<script lang="ts">
  import DownloadIcon from 'iconoir/icons/download.svg?raw'
  import PlayIcon from 'iconoir/icons/play.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import RestartIcon from 'iconoir/icons/restart.svg?raw'
  import SquareIcon from 'iconoir/icons/square.svg?raw'
  import { onMount } from 'svelte'
  import type { ServiceInfo } from '../../../../../../shared/terminal'
  import { config } from '../../../stores'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  let info = $state<(ServiceInfo & { binaryPath: string | null; version: string | null }) | null>(
    null
  )
  let loaded = $state(false)
  let busy = $state('')
  let progress = $state('')
  let error = $state('')
  let update = $state<{ latestVersion: string; updateAvailable: boolean } | null>(null)
  const installed = $derived(!!info?.binaryPath)
  const running = $derived(info?.status === 'started')
  const starting = $derived(info?.status === 'starting')
  const active = $derived(running || starting || !!info?.pid)
  const disabled = $derived(!!busy || starting || info?.status === 'stopping')

  onMount(() => {
    let disposed = false
    const unsubscribe = window.electronAPI.onData((event) => {
      if (event.type === 'ollama:info') info = event.data
      if (event.type === 'status:ollama-setup') progress = event.data ?? ''
    })
    window.electronAPI
      .getOllamaInfo()
      .then((value) => {
        if (!disposed) {
          info = value
          loaded = true
        }
      })
      .catch((e) => {
        if (!disposed) error = String(e)
      })
    return () => {
      disposed = true
      unsubscribe()
    }
  })

  const perform = async (name: string, action: () => Promise<unknown>): Promise<void> => {
    busy = name
    error = ''
    try {
      await action()
      info = await window.electronAPI.getOllamaInfo()
      config.set(await window.electronAPI.getConfig())
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = ''
      progress = ''
    }
  }
  const save = async (key: string, value: string | number | boolean): Promise<void> => {
    error = ''
    try {
      await window.electronAPI.setConfig({ ollama: { ...$config?.ollama, [key]: value } })
      config.set(await window.electronAPI.getConfig())
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
</script>

{#snippet versionField()}
  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <label
        for="ollama-version"
        class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white"
        >{$i18n.t('settings.inference.version')}</label
      >
      <div
        class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
      >
        {$i18n.t('settings.ollama.versionDesc')}
      </div>
    </div>
    <input
      id="ollama-version"
      type="text"
      {disabled}
      class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-[96px]"
      value={$config?.ollama?.version ?? 'latest'}
      onchange={(event) => save('version', event.currentTarget.value.trim() || 'latest')}
    />
  </div>
{/snippet}

{#snippet icon(svg: string, spinning = false)}
  <span
    aria-hidden="true"
    class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
    class:animate-spin={spinning}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Only bundled Iconoir SVG imports are passed here. -->
    {@html svg}
  </span>
{/snippet}

<div class="flex min-w-0 flex-col text-[#171717] dark:text-white">
  {#if !loaded}
    <div class="py-6 text-[12px] text-center">{$i18n.t('common.loading')}</div>
  {:else if !installed}
    <div>
      <div
        class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
      >
        <div>
          <div
            class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white flex items-center gap-[6px]"
          >
            {$i18n.t('settings.ollama.notInstalled')}
            <span class="text-[10px] text-gray-600 dark:text-gray-400"
              >{$i18n.t('common.experimental')}</span
            >
          </div>
          <div
            class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
          >
            {$i18n.t('settings.ollama.notInstalledDesc')}
          </div>
        </div>
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
          {disabled}
          onclick={() => perform('start', () => window.electronAPI.startOllama())}
        >
          {#if busy === 'start' || starting}{@render icon(RefreshIcon, true)}{/if}
          {$i18n.t(busy === 'start' || starting ? 'common.installing' : 'common.install')}
        </button>
      </div>
      {#if progress}<div
          role="status"
          class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mb-3 font-mono truncate"
        >
          {progress}
        </div>{/if}
      {#if starting}
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
          disabled={busy === 'stop'}
          onclick={() => perform('stop', () => window.electronAPI.stopOllama())}
        >
          {@render icon(SquareIcon)}{$i18n.t('common.stop')}
        </button>
      {/if}
      {@render versionField()}
    </div>
  {:else}
    <div>
      <div class="mb-[4px] pb-[14px]">
        <div
          class="flex min-w-0 items-center justify-between gap-[16px] pb-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0"
        >
          <div>
            <div
              class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white flex items-center gap-[6px]"
            >
              Ollama
              <span class="text-[10px] text-gray-600 dark:text-gray-400"
                >{$i18n.t('common.experimental')}</span
              >
            </div>
            <div
              class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
            >
              {$i18n.t('settings.ollama.description')}
            </div>
          </div>
          <div
            class="flex shrink-0 items-center gap-[8px] text-[11px] text-[#676767] dark:text-[#b4b4b4]"
          >
            <div
              class="w-1.5 h-1.5 rounded-full {running
                ? 'bg-emerald-400'
                : starting || info?.status === 'stopping'
                  ? 'bg-amber-400/60 animate-pulse'
                  : info?.status === 'failed'
                    ? 'bg-red-400/70'
                    : 'bg-black/15 dark:bg-white/20'}"
            ></div>
            <span class="text-[12px]"
              >{$i18n.t(
                running
                  ? 'common.running'
                  : starting
                    ? 'common.starting'
                    : info?.status === 'stopping'
                      ? 'common.stopping'
                      : info?.status === 'failed'
                        ? 'common.failed'
                        : 'common.stopped'
              )}</span
            >
          </div>
        </div>
        {#if progress}<div
            role="status"
            class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mb-3 font-mono truncate"
          >
            {progress}
          </div>{/if}
        <div class="flex flex-wrap items-center gap-[12px]">
          {#if active}
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
              disabled={busy === 'stop' || info?.status === 'stopping'}
              onclick={() => perform('stop', () => window.electronAPI.stopOllama())}
            >
              {@render icon(busy === 'stop' ? RefreshIcon : SquareIcon, busy === 'stop')}
              {$i18n.t(busy === 'stop' ? 'common.stopping' : 'common.stop')}
            </button>
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
              {disabled}
              onclick={() =>
                perform('restart', async () => {
                  await window.electronAPI.stopOllama()
                  await window.electronAPI.startOllama()
                })}
            >
              {@render icon(busy === 'restart' ? RefreshIcon : RestartIcon, busy === 'restart')}
              {$i18n.t(busy === 'restart' ? 'common.restarting' : 'common.restart')}
            </button>
          {:else}
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
              {disabled}
              onclick={() => perform('start', () => window.electronAPI.startOllama())}
            >
              {@render icon(busy === 'start' ? RefreshIcon : PlayIcon, busy === 'start')}
              {$i18n.t(busy === 'start' ? 'common.starting' : 'common.start')}
            </button>
          {/if}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
            {disabled}
            onclick={() => perform('setup', () => window.electronAPI.setupOllama())}
          >
            {@render icon(busy === 'setup' ? RefreshIcon : DownloadIcon, busy === 'setup')}
            {$i18n.t(busy === 'setup' ? 'common.downloading' : 'settings.inference.redownload')}
          </button>
        </div>
      </div>

      {#if running && info}
        <div class="mb-[4px] pb-[14px]">
          <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white mb-2">
            {$i18n.t('settings.inference.runningInstance')}
          </div>
          <div
            class="text-[11px] [&>div]:py-[4px] [&>div]:gap-[12px] max-sm:[&>div>:last-child]:max-w-[75%]"
          >
            <div
              class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
            >
              <span
                class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]"
                >{$i18n.t('common.url')}</span
              >
              <button
                class="min-w-0 [overflow-wrap:anywhere] text-right text-[11px] text-[#676767] transition-colors duration-150 hover:text-[#171717] dark:text-[#b4b4b4] dark:hover:text-white font-mono"
                onclick={() => window.electronAPI.openInBrowser(info?.url)}>{info.url}</button
              >
            </div>
            <div
              class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
            >
              <span
                class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]"
                >{$i18n.t('common.processId')}</span
              >
              <span class="text-[12px] font-mono">{info.pid}</span>
            </div>
            {#if info.version}
              <div
                class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
              >
                <span
                  class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]"
                  >{$i18n.t('settings.inference.build')}</span
                >
                <span class="text-[12px] font-mono">{info.version}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="mb-[4px] pb-[14px]">
        <div
          class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
        >
          <div>
            <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
              {$i18n.t('settings.about.softwareUpdate')}
            </div>
            {#if busy === 'update'}
              <div
                class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
              >
                {$i18n.t('settings.inference.updating')}
              </div>
            {:else if update}
              <div
                class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
              >
                {$i18n.t(
                  update.updateAvailable
                    ? 'settings.inference.updateAvailable'
                    : 'settings.inference.upToDate',
                  { version: update.latestVersion }
                )}
              </div>
            {/if}
          </div>
          {#if update?.updateAvailable}
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
              {disabled}
              onclick={() =>
                perform('update', async () => {
                  await window.electronAPI.updateOllama()
                  update = null
                })}
            >
              {#if busy === 'update'}{@render icon(RefreshIcon, true)}{/if}
              {$i18n.t(busy === 'update' ? 'common.updating' : 'common.update')}
            </button>
          {:else}
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
              {disabled}
              onclick={() =>
                perform('check', async () => {
                  update = await window.electronAPI.checkOllamaUpdate()
                })}
            >
              {#if busy === 'check'}{@render icon(RefreshIcon, true)}{/if}
              {$i18n.t(
                busy === 'check'
                  ? 'settings.inference.checking'
                  : 'settings.inference.checkForUpdates'
              )}
            </button>
          {/if}
        </div>
      </div>

      <div
        class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
      >
        <div>
          <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
            {$i18n.t('settings.inference.startOnLaunch')}
          </div>
          <div
            class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
          >
            {$i18n.t('settings.ollama.startOnLaunchDesc')}
          </div>
        </div>
        <Switch
          checked={$config?.ollama?.enabled ?? false}
          label={$i18n.t('settings.inference.startOnLaunch')}
          {disabled}
          onchange={(value) => save('enabled', value)}
        />
      </div>
      {@render versionField()}
      <div
        class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
      >
        <div>
          <label
            for="ollama-port"
            class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white"
            >{$i18n.t('settings.inference.port')}</label
          >
          <div
            class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
          >
            {$i18n.t('settings.ollama.portDesc')}
          </div>
        </div>
        <input
          id="ollama-port"
          type="number"
          min="1"
          max="65535"
          step="1"
          {disabled}
          class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-[88px]"
          value={$config?.ollama?.port ?? 11434}
          onchange={(event) => {
            if (event.currentTarget.reportValidity() && event.currentTarget.value)
              save('port', Number(event.currentTarget.value))
          }}
        />
      </div>
      <div
        class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%] mt-[10px] pt-[16px]!"
      >
        <div>
          <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
            {$i18n.t('settings.inference.uninstall')}
          </div>
          <div
            class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5"
          >
            {$i18n.t('settings.ollama.uninstallDesc')}
          </div>
        </div>
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
          {disabled}
          onclick={() =>
            perform('uninstall', async () => {
              await window.electronAPI.uninstallOllama()
              update = null
            })}
        >
          {#if busy === 'uninstall'}{@render icon(RefreshIcon, true)}{/if}
          {$i18n.t(busy === 'uninstall' ? 'common.uninstalling' : 'common.uninstall')}
        </button>
      </div>
    </div>
  {/if}
  {#if error || info?.error}<div
      role="alert"
      class="mt-2 break-words text-[11px] text-red-600 dark:text-red-400"
    >
      {error || info?.error}
    </div>{/if}
</div>
