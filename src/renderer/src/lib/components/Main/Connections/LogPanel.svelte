<script lang="ts">
  import { fly } from 'svelte/transition'
  import i18n from '../../../i18n'
  import { tooltip } from '../../../actions/tooltip'
  import LogViewer from '../../common/LogViewer.svelte'

  interface Props {
    activeLog: 'server' | 'open-terminal' | 'llama-server'
    serviceReady: boolean
    statusText?: string
    connectPty: (callback: (data: string) => void) => void
    disconnectPty: () => void
    readonly?: boolean
    onWrite?: (data: string) => void
    onResize?: (cols: number, rows: number) => void
    onStop?: () => Promise<void>
    onClose: () => void
  }

  let {
    activeLog,
    serviceReady,
    statusText = '',
    connectPty,
    disconnectPty,
    readonly = false,
    onWrite,
    onResize,
    onStop,
    onClose
  }: Props = $props()

  let stopping = $state(false)

  let panelHeight = $state(250)
  let dragging = $state(false)
  let startY = 0
  let startHeight = 0
  let copied = $state(false)
  let refreshKey = $state(0)

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

    // Overlay prevents webview from capturing mouse events during drag
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ns-resize;'
    document.body.appendChild(overlay)

    const onDragMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      panelHeight = Math.max(120, Math.min(600, startHeight + delta))
    }

    const onDragEnd = () => {
      dragging = false
      overlay.remove()
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
  class="shrink-0 flex flex-col border-t border-black/[0.1] dark:border-white/[0.1] bg-[#0a0a0a] overflow-hidden"
  style="height: {panelHeight}px"
  in:fly={{ y: 60, duration: 200 }}
  out:fly={{ y: 60, duration: 150 }}
>
  <!-- Resize edge -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="h-0 shrink-0 cursor-ns-resize relative"
    onmousedown={onDragStart}
  >
    <div class="absolute -top-[3px] left-0 right-0 h-[6px] z-10"></div>
  </div>

  <!-- Header bar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex items-center justify-between px-3 py-1 shrink-0 border-b border-white/[0.06] cursor-pointer" onclick={onClose}>
    <div class="flex items-center gap-2">
      <span class="text-[11px] uppercase tracking-wider text-white/40 font-medium">{logLabels[activeLog]?.() ?? activeLog}</span>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex items-center gap-0.5" onclick={(e) => e.stopPropagation()}>
      <!-- Stop button (Open Terminal / llama.cpp only) -->
      {#if onStop && serviceReady}
        <button
          class="p-1 rounded-md hover:bg-white/[0.08] transition bg-transparent border-none cursor-pointer {stopping ? 'opacity-30 pointer-events-none' : 'opacity-40 hover:opacity-80'} text-white"
          disabled={stopping}
          onclick={async () => {
            stopping = true
            try {
              await onStop()
            } finally {
              stopping = false
              onClose()
            }
          }}
          use:tooltip={$i18n.t('common.stop')}
        >
          {#if stopping}
            <div class="w-3.5 h-3.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
          {:else}
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
            </svg>
          {/if}
        </button>
      {/if}
      <!-- Copy button -->
      <button
        class="p-1 rounded-md opacity-40 hover:opacity-80 hover:bg-white/[0.08] transition bg-transparent border-none text-white cursor-pointer"
        onclick={copyLogs}
        title={$i18n.t('logs.copyLogs')}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          {#if copied}
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          {/if}
        </svg>
      </button>
      <!-- Refresh button -->
      <button
        class="p-1 rounded-md opacity-40 hover:opacity-80 hover:bg-white/[0.08] transition bg-transparent border-none text-white cursor-pointer"
        onclick={() => { disconnectPty(); refreshKey++ }}
        title={$i18n.t('common.refresh')}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
        </svg>
      </button>
      <!-- Close button -->
      <button
        class="p-1 rounded-md opacity-40 hover:opacity-80 hover:bg-white/[0.08] transition bg-transparent border-none text-white cursor-pointer"
        onclick={onClose}
        title={$i18n.t('common.close')}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Log content -->
  <div class="flex-1 min-h-0 relative overflow-hidden">
    {#if serviceReady}
      {#key `${activeLog}-${refreshKey}`}
        <LogViewer
          bind:this={logViewerRef}
          connect={connectPty}
          disconnect={disconnectPty}
          {readonly}
          {onWrite}
          {onResize}
        />
      {/key}
    {:else}
      <div class="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
        <div class="flex flex-col items-center gap-3">
          <div class="w-5 h-5 rounded-full border-2 border-white/15 border-t-white/50 animate-spin"></div>
          <span class="text-[11px] text-white/50">{statusText || $i18n.t('common.loading')}</span>
        </div>
      </div>
    {/if}
  </div>
</div>
