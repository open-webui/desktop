<script lang="ts">
  import { fade } from 'svelte/transition'
  import i18n from '../../../i18n'
  import { tooltip } from '../../../actions/tooltip'

  interface Props {
    serverStatus: string | undefined
    serverReachable: boolean | undefined
    openTerminalStatus: string | null
    llamaCppStatus: string | null
    activeLog: string | null
    onSelectLog: (log: string) => void
    onToggleOpenTerminal: () => void
    onToggleLlamaCpp: () => void
  }

  let {
    serverStatus,
    serverReachable,
    openTerminalStatus,
    llamaCppStatus,
    activeLog,
    onSelectLog,
    onToggleOpenTerminal,
    onToggleLlamaCpp
  }: Props = $props()

  // Derived server state
  const serverRunning = $derived(serverStatus === 'running' && serverReachable)
  const serverStarting = $derived(
    serverStatus === 'starting' || (serverStatus === 'running' && !serverReachable)
  )

  const otRunning = $derived(openTerminalStatus === 'started')
  const otStarting = $derived(openTerminalStatus === 'starting' || openTerminalStatus === 'stopping')
  const otFailed = $derived(openTerminalStatus === 'failed')

  const lsRunning = $derived(llamaCppStatus === 'started')
  const lsStarting = $derived(
    llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up' || llamaCppStatus === 'stopping'
  )
  const lsFailed = $derived(llamaCppStatus === 'failed')
</script>

<div
  class="shrink-0 flex items-center gap-0.5 px-2 py-1 border-t border-black/[0.06] dark:border-white/[0.06] bg-[#f5f5f7] dark:bg-[#0a0a0a]"
  in:fade={{ duration: 150 }}
>
  <!-- Server status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'server'
      ? 'bg-black/[0.06] dark:bg-white/[0.08] opacity-70'
      : 'opacity-35 hover:opacity-60 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}"
    onclick={() => onSelectLog('server')}
    use:tooltip={serverRunning
      ? $i18n.t('statusBar.serverRunning')
      : serverStarting
        ? $i18n.t('common.starting')
        : $i18n.t('statusBar.serverStopped')}
  >
    <div class="w-[6px] h-[6px] shrink-0 rounded-full {serverRunning
      ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
      : serverStarting
        ? 'bg-amber-400/60 animate-pulse'
        : 'bg-black/10 dark:bg-white/15'}">
    </div>
    <span>{$i18n.t('statusBar.server')}</span>
  </button>

  <div class="w-px h-2.5 bg-black/[0.06] dark:bg-white/[0.06] mx-0.5"></div>

  <!-- Open Terminal status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'open-terminal'
      ? 'bg-black/[0.06] dark:bg-white/[0.08] opacity-70'
      : 'opacity-35 hover:opacity-60 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}"
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
    <div class="w-[6px] h-[6px] shrink-0 rounded-full {otRunning
      ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
      : otStarting
        ? 'bg-amber-400/60 animate-pulse'
        : otFailed
          ? 'bg-red-400/70'
          : 'bg-black/10 dark:bg-white/15'}">
    </div>
    <span>{$i18n.t('sidebar.openTerminal')}</span>
  </button>

  <div class="w-px h-2.5 bg-black/[0.06] dark:bg-white/[0.06] mx-0.5"></div>

  <!-- llama.cpp status -->
  <button
    class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] {activeLog === 'llama-server'
      ? 'bg-black/[0.06] dark:bg-white/[0.08] opacity-70'
      : 'opacity-35 hover:opacity-60 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}"
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
    <div class="w-[6px] h-[6px] shrink-0 rounded-full {lsRunning
      ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
      : lsStarting
        ? 'bg-amber-400/60 animate-pulse'
        : lsFailed
          ? 'bg-red-400/70'
          : 'bg-black/10 dark:bg-white/15'}">
    </div>
    <span>{$i18n.t('sidebar.llamaCpp')}</span>
  </button>
</div>
