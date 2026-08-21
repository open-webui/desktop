<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  import type { ManagedServiceSnapshot } from '../../../../shared/services/types'
  import ManagedServiceLogs from './ManagedServiceLogs.svelte'

  type MainDataMessage = { type: string; data?: unknown }

  let services = $state<ManagedServiceSnapshot[]>([])
  let expanded = $state(false)
  let logService = $state<ManagedServiceSnapshot | null>(null)
  let unsubscribe: (() => void) | null = null

  const visible = $derived(services.slice(0, 3))
  const overflow = $derived(services.slice(3))

  const refresh = async (): Promise<void> => {
    try {
      services = await window.electronAPI.listManagedServices()
    } catch {
      services = []
    }
  }

  const updateStatus = (service: ManagedServiceSnapshot): void => {
    const index = services.findIndex((entry) => entry.id === service.id)
    services =
      index === -1
        ? [...services, service]
        : services.map((entry, itemIndex) => (itemIndex === index ? service : entry))
    if (logService?.id === service.id) logService = service
  }

  const activate = async (service: ManagedServiceSnapshot): Promise<void> => {
    if (service.status === 'stopped' || service.status === 'failed') {
      updateStatus(await window.electronAPI.startManagedService(service.id))
    } else {
      logService = service
    }
  }

  const stop = async (event: MouseEvent, service: ManagedServiceSnapshot): Promise<void> => {
    event.preventDefault()
    if (service.status === 'running' || service.status === 'starting') {
      updateStatus(await window.electronAPI.stopManagedService(service.id))
    }
  }

  const dotClass = (status: ManagedServiceSnapshot['status']): string => {
    if (status === 'running') return 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]'
    if (status === 'starting') return 'bg-amber-400 animate-pulse'
    if (status === 'failed') return 'bg-red-400'
    return 'bg-black/15 dark:bg-white/20'
  }

  onMount(() => {
    void refresh()
    unsubscribe = window.electronAPI.onData((message: MainDataMessage) => {
      if (message.type === 'managed-services:changed' && Array.isArray(message.data)) {
        services = message.data as ManagedServiceSnapshot[]
      }
      if (message.type === 'managed-service:status' && message.data) {
        updateStatus(message.data as ManagedServiceSnapshot)
      }
    })
  })

  onDestroy(() => unsubscribe?.())
</script>

{#if services.length}
  <div class="mx-0.5 h-3 w-px shrink-0 bg-black/[0.08] dark:bg-white/[0.08]"></div>
  <div class="relative flex min-w-0 items-center gap-0.5">
    {#each visible as service (service.id)}
      <button
        class="flex max-w-28 items-center gap-1.5 truncate rounded-md border-none bg-transparent px-2 py-0.5 text-[11px] text-[#1d1d1f] opacity-50 transition-all hover:bg-black/[0.04] hover:opacity-80 dark:text-[#fafafa] dark:hover:bg-white/[0.06]"
        title={`${service.name}: ${service.status}${service.lastError ? ` — ${service.lastError}` : ''}`}
        onclick={() => activate(service)}
        oncontextmenu={(event) => stop(event, service)}
      >
        <span class={`h-[7px] w-[7px] shrink-0 rounded-full ${dotClass(service.status)}`}></span>
        <span class="truncate">{service.name}</span>
      </button>
    {/each}

    {#if overflow.length}
      <button
        class="rounded-md border-none bg-transparent px-2 py-0.5 text-[11px] opacity-45 hover:bg-black/[0.04] hover:opacity-80 dark:hover:bg-white/[0.06]"
        title={`${overflow.length} more managed services`}
        onclick={() => (expanded = !expanded)}>+{overflow.length}</button
      >
    {/if}

    {#if expanded}
      <div
        class="absolute bottom-7 right-0 z-50 w-64 overflow-hidden rounded-xl border border-black/10 bg-[#f5f5f7] p-1.5 shadow-xl dark:border-white/10 dark:bg-[#1d1d1f]"
      >
        {#each overflow as service (service.id)}
          <button
            class="flex w-full items-center gap-2 rounded-lg border-none bg-transparent px-2.5 py-2 text-left text-[11px] hover:bg-black/5 dark:hover:bg-white/10"
            onclick={() => {
              expanded = false
              void activate(service)
            }}
            oncontextmenu={(event) => stop(event, service)}
          >
            <span class={`h-[7px] w-[7px] shrink-0 rounded-full ${dotClass(service.status)}`}
            ></span>
            <span class="min-w-0 flex-1 truncate">{service.name}</span>
            <span class="opacity-35">{service.status}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if logService}
  <ManagedServiceLogs
    id={logService.id}
    name={logService.name}
    onClose={() => (logService = null)}
  />
{/if}
