<script lang="ts">
  import { fade } from 'svelte/transition'
  import i18n from '../../../i18n'
  import { tooltip } from '../../../actions/tooltip'
  import { appInfo } from '../../../stores'
  import trayIcon from '../../../../../../../resources/tray.png'

  interface Props {
    serverStatus: string | undefined
    serverReachable: boolean | undefined
    openTerminalStatus: string | null
    llamaCppStatus: string | null
    openWebuiInstalled: boolean
    openTerminalInstalled: boolean
    llamaCppInstalled: boolean
    activeLog: string | null
    onSelectLog: (log: string) => void
    onStartServer: () => void
    onToggleOpenTerminal: () => void
    onToggleLlamaCpp: () => void
  }

  let {
    serverStatus,
    serverReachable,
    openTerminalStatus,
    llamaCppStatus,
    openWebuiInstalled,
    openTerminalInstalled,
    llamaCppInstalled,
    activeLog,
    onSelectLog,
    onStartServer,
    onToggleOpenTerminal,
    onToggleLlamaCpp
  }: Props = $props()

  // Derived server state
  const serverRunning = $derived(serverStatus === 'started' && serverReachable)
  const serverStarting = $derived(
    serverStatus === 'starting' || (serverStatus === 'started' && !serverReachable)
  )

  const otRunning = $derived(openTerminalStatus === 'started')
  const otStarting = $derived(openTerminalStatus === 'starting' || openTerminalStatus === 'stopping')
  const otFailed = $derived(openTerminalStatus === 'failed')

  const lsRunning = $derived(llamaCppStatus === 'started')
  const lsStarting = $derived(
    llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up' || llamaCppStatus === 'stopping'
  )
  const lsFailed = $derived(llamaCppStatus === 'failed')

  // Derived visibility — show each section only when installed or active
  const showServer = $derived(openWebuiInstalled || !!serverStatus)
  const showTerminal = $derived(openTerminalInstalled || !!openTerminalStatus)
  const showLlama = $derived(llamaCppInstalled || !!llamaCppStatus)
</script>

<div
  class="shrink-0 flex items-center gap-1 px-3 h-7 border-t border-black/[0.08] dark:border-white/[0.08] bg-[#ebebed] dark:bg-[#111111]"
  in:fade={{ duration: 150 }}
>
  <!-- Open WebUI logo mark -->
  <img src={trayIcon} alt="" class="w-3.5 opacity-30 mx-0.5 shrink-0 invert dark:invert-0" />

  {#if showServer}
  <!-- Open WebUI status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] transition-all bg-transparent border-none cursor-pointer text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'server'
      ? 'bg-black/[0.08] dark:bg-white/[0.1] opacity-90'
      : 'opacity-50 hover:opacity-80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}"
    onclick={() => {
      if (!serverRunning && !serverStarting) {
        onStartServer()
      }
      onSelectLog('server')
    }}
    use:tooltip={serverRunning
      ? $i18n.t('statusBar.serverRunning')
      : serverStarting
        ? $i18n.t('common.starting')
        : $i18n.t('statusBar.serverStopped')}
  >
    <div class="w-[7px] h-[7px] shrink-0 rounded-full {serverRunning
      ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]'
      : serverStarting
        ? 'bg-amber-400 animate-pulse'
        : 'bg-black/15 dark:bg-white/20'}">
    </div>
    <span>{$i18n.t('statusBar.server')}</span>
  </button>
  {/if}

  {#if showTerminal}
  {#if showServer}
  <div class="w-px h-3 bg-black/[0.08] dark:bg-white/[0.08] mx-0.5"></div>
  {/if}

  <!-- Open Terminal status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] transition-all bg-transparent border-none cursor-pointer text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'open-terminal'
      ? 'bg-black/[0.08] dark:bg-white/[0.1] opacity-90'
      : 'opacity-50 hover:opacity-80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}"
    onclick={() => {
      if (!otRunning && !otStarting) {
        onToggleOpenTerminal()
      }
      onSelectLog('open-terminal')
    }}
    oncontextmenu={(e) => {
      e.preventDefault()
      if (otRunning) onToggleOpenTerminal()
    }}
    use:tooltip={otRunning
      ? activeLog === 'open-terminal'
        ? $i18n.t('sidebar.tooltip.hideLogs')
        : $i18n.t('sidebar.tooltip.viewLogs')
      : otStarting
        ? $i18n.t('common.starting')
        : otFailed
          ? $i18n.t('sidebar.tooltip.clickToRetry')
          : $i18n.t('sidebar.tooltip.startTerminalServer')}
  >
    <div class="w-[7px] h-[7px] shrink-0 rounded-full {otRunning
      ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]'
      : otStarting
        ? 'bg-amber-400 animate-pulse'
        : otFailed
          ? 'bg-red-400'
          : 'bg-black/15 dark:bg-white/20'}">
    </div>
    <span>{$i18n.t('sidebar.openTerminal')}</span>
  </button>
  {/if}

  {#if showLlama}
  {#if showServer || showTerminal}
  <div class="w-px h-3 bg-black/[0.08] dark:bg-white/[0.08] mx-0.5"></div>
  {/if}

  <!-- llama.cpp status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] transition-all bg-transparent border-none cursor-pointer text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'llama-server'
      ? 'bg-black/[0.08] dark:bg-white/[0.1] opacity-90'
      : 'opacity-50 hover:opacity-80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'}"
    onclick={() => {
      if (!lsRunning && !lsStarting) {
        onToggleLlamaCpp()
      }
      onSelectLog('llama-server')
    }}
    oncontextmenu={(e) => {
      e.preventDefault()
      if (lsRunning) onToggleLlamaCpp()
    }}
    use:tooltip={lsRunning
      ? activeLog === 'llama-server'
        ? $i18n.t('sidebar.tooltip.hideLogs')
        : $i18n.t('sidebar.tooltip.viewLogs')
      : lsStarting
        ? $i18n.t('common.starting')
        : lsFailed
          ? $i18n.t('sidebar.tooltip.clickToRetry')
          : $i18n.t('sidebar.tooltip.startLlamaServer')}
  >
    <div class="w-[7px] h-[7px] shrink-0 rounded-full {lsRunning
      ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]'
      : lsStarting
        ? 'bg-amber-400 animate-pulse'
        : lsFailed
          ? 'bg-red-400'
          : 'bg-black/15 dark:bg-white/20'}">
    </div>
    <span>{$i18n.t('sidebar.llamaCpp')}</span>
  </button>
  {/if}

  <!-- Version (right-aligned) -->
  <span class="ml-auto text-[10px] opacity-25 select-none">v{$appInfo?.version ?? ''}</span>
</div>
