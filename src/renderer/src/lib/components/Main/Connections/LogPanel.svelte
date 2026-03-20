<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import i18n from '../../../i18n'
  import LogViewer from '../../common/LogViewer.svelte'

  interface Props {
    activeLog: 'server' | 'open-terminal' | 'llama-server'
    connectPty: (callback: (data: string) => void) => void
    disconnectPty: () => void
    readonly?: boolean
    onWrite?: (data: string) => void
    onResize?: (cols: number, rows: number) => void
    onClose: () => void
  }

  let {
    activeLog,
    connectPty,
    disconnectPty,
    readonly = false,
    onWrite,
    onResize,
    onClose
  }: Props = $props()

  let panelHeight = $state(250)
  let dragging = $state(false)
  let startY = 0
  let startHeight = 0
  let copied = $state(false)

  let logViewerRef: LogViewer | undefined = $state()

  const logLabels: Record<string, () => string> = {
    'server': () => $i18n.t('statusBar.server'),
    'open-terminal': () => $i18n.t('sidebar.openTerminal'),
    'llama-server': () => $i18n.t('sidebar.llamaCpp')
  }

  const onDragStart = (e: MouseEvent) => {
    dragging = true
    startY = e.clientY
    startHeight = panelHeight

    const onDragMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      panelHeight = Math.max(120, Math.min(600, startHeight + delta))
    }

    const onDragEnd = () => {
      dragging = false
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
    }

    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
  }

  const copyLogs = () => {
    const text = logViewerRef?.getBufferText?.()
    if (text) {
      navigator.clipboard.writeText(text)
      copied = true
      setTimeout(() => { copied = false }, 1500)
    }
  }
</script>

<div
  class="shrink-0 flex flex-col border-t border-black/[0.08] dark:border-white/[0.08] bg-[#0a0a0a] overflow-hidden"
  style="height: {panelHeight}px"
  in:fly={{ y: 60, duration: 200 }}
  out:fly={{ y: 60, duration: 150 }}
>
  <!-- Drag handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="h-1 shrink-0 cursor-ns-resize group flex items-center justify-center hover:bg-white/[0.04] transition {dragging ? 'bg-white/[0.06]' : ''}"
    onmousedown={onDragStart}
  >
    <div class="w-8 h-[2px] rounded-full bg-white/[0.08] group-hover:bg-white/[0.15] transition"></div>
  </div>

  <!-- Header bar -->
  <div class="flex items-center justify-between px-3 py-1 shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-[10px] uppercase tracking-wider text-white/25">{logLabels[activeLog]?.() ?? activeLog}</span>
    </div>
    <div class="flex items-center gap-1">
      <!-- Copy button -->
      <button
        class="p-1 rounded-md opacity-25 hover:opacity-60 hover:bg-white/[0.06] transition bg-transparent border-none text-white cursor-pointer"
        onclick={copyLogs}
        title={$i18n.t('logs.copyLogs')}
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          {#if copied}
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          {/if}
        </svg>
      </button>
      <!-- Close button -->
      <button
        class="p-1 rounded-md opacity-25 hover:opacity-60 hover:bg-white/[0.06] transition bg-transparent border-none text-white cursor-pointer"
        onclick={onClose}
        title={$i18n.t('common.close')}
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Log content -->
  <div class="flex-1 min-h-0 relative overflow-hidden">
    {#key activeLog}
      <LogViewer
        bind:this={logViewerRef}
        connect={connectPty}
        disconnect={disconnectPty}
        {readonly}
        {onWrite}
        {onResize}
      />
    {/key}
  </div>
</div>
