<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  interface Props {
    id: string
    name: string
    onClose: () => void
  }

  let { id, name, onClose }: Props = $props()
  let lines = $state<string[]>([])
  let error = $state('')
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  const refresh = async (): Promise<void> => {
    try {
      lines = await window.electronAPI.getManagedServiceLogs(id)
      error = ''
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }

  const copyLogs = async (): Promise<void> => {
    await navigator.clipboard.writeText(lines.join('\n'))
  }

  onMount(() => {
    void refresh()
    refreshTimer = setInterval(refresh, 1000)
  })

  onDestroy(() => {
    if (refreshTimer) clearInterval(refreshTimer)
  })
</script>

<div
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-6"
  role="presentation"
  onclick={onClose}
>
  <section
    class="flex h-[min(70vh,620px)] w-[min(900px,90vw)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#f5f5f7] shadow-2xl dark:border-white/10 dark:bg-[#171717]"
    role="dialog"
    aria-modal="true"
    aria-label={`${name} logs`}
    onclick={(event) => event.stopPropagation()}
  >
    <header class="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-medium">{name}</div>
        <div class="text-[10px] opacity-40">Last 500 stdout/stderr lines</div>
      </div>
      <button
        class="rounded-lg px-2.5 py-1 text-[11px] opacity-55 hover:bg-black/5 hover:opacity-90 dark:hover:bg-white/10"
        onclick={copyLogs}>Copy</button
      >
      <button
        class="rounded-lg px-2.5 py-1 text-[11px] opacity-55 hover:bg-black/5 hover:opacity-90 dark:hover:bg-white/10"
        onclick={onClose}>Close</button
      >
    </header>
    {#if error}
      <div
        class="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] text-red-600 dark:text-red-300"
      >
        {error}
      </div>
    {/if}
    <pre
      class="m-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-[#101113] p-4 font-mono text-[11px] leading-5 text-[#d6d9df]">{lines.length
        ? lines.join('\n')
        : 'No output yet.'}</pre>
  </section>
</div>
