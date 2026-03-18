<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { onMount } from 'svelte'
  import { connections, config, appState, appInfo } from '../../stores'

  import logoImage from '../../assets/images/splash.png'

  let view = $state('list') // list | add
  let url = $state('')
  let name = $state('')
  let connecting = $state(false)
  let error = $state('')
  let visible = $state(false)

  onMount(async () => {
    connections.set(await window.electronAPI.getConnections())
    config.set(await window.electronAPI.getConfig())
    setTimeout(() => { visible = true }, 50)
  })

  const add = async () => {
    if (!url.trim()) return
    let u = url.trim()
    if (!u.startsWith('http')) u = 'https://' + u
    error = ''
    connecting = true
    try {
      const valid = await window.electronAPI.validateUrl(u)
      if (!valid) { error = 'Unreachable'; connecting = false; return }
      await window.electronAPI.addConnection({
        id: crypto.randomUUID(),
        name: name.trim() || new URL(u).hostname,
        type: 'remote',
        url: u
      })
      connections.set(await window.electronAPI.getConnections())
      config.set(await window.electronAPI.getConfig())
      url = ''; name = ''; view = 'list'
    } catch { error = 'Failed' }
    finally { connecting = false }
  }

  const connect = (id: string) => window.electronAPI.connectTo(id)
  const setDefault = async (id: string) => {
    await window.electronAPI.setDefaultConnection(id)
    config.set(await window.electronAPI.getConfig())
  }
  const remove = async (id: string) => {
    await window.electronAPI.removeConnection(id)
    const conns = await window.electronAPI.getConnections()
    connections.set(conns)
    config.set(await window.electronAPI.getConfig())
    if (conns.length === 0) appState.set('setup')
  }
</script>

{#if visible}
  <div class="h-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]" in:fade={{ duration: 250 }}>
    <!-- Header -->
    <div class="flex items-center justify-between {$appInfo?.platform === 'darwin' ? 'pl-[76px]' : 'pl-5'} pr-5 pt-3 pb-2 drag-region">
      <div class="text-[13px] opacity-50">Connections</div>
      <img src={logoImage} class="w-5 h-5 rounded-full dark:invert opacity-40" alt="logo" />
    </div>

    <div class="mx-5 border-b border-black/[0.06] dark:border-white/[0.06]"></div>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto px-5 py-3">
      {#if view === 'list'}
        <div class="flex flex-col">
          {#each $connections as conn, i (conn.id)}
            <div
              class="w-full py-3 cursor-pointer group flex items-center gap-3 transition-opacity hover:opacity-100 opacity-70 {i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.04]' : ''}"
              role="button"
              tabindex="0"
              onclick={() => connect(conn.id)}
              onkeydown={(e) => e.key === 'Enter' && connect(conn.id)}
              in:fly={{ y: 4, duration: 150, delay: i * 30 }}
            >
              <div class="w-[6px] h-[6px] rounded-full shrink-0 {conn.type === 'local' ? 'bg-green-400/70' : 'bg-black/8 dark:bg-white/10'}"></div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] truncate">{conn.name}</span>
                  {#if $config?.defaultConnectionId === conn.id}
                    <span class="text-[10px] opacity-30">default</span>
                  {/if}
                </div>
                <span class="text-[11px] opacity-20 truncate block mt-px">{conn.url}</span>
              </div>

              <div class="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {#if $config?.defaultConnectionId !== conn.id}
                  <button
                    class="p-1.5 opacity-20 hover:opacity-60 text-[10px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                    onclick={(e) => { e.stopPropagation(); setDefault(conn.id) }}
                  >★</button>
                {/if}
                <button
                  class="p-1.5 opacity-20 hover:text-red-400 hover:opacity-80 text-[10px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
                  onclick={(e) => { e.stopPropagation(); remove(conn.id) }}
                >✕</button>
              </div>
            </div>
          {:else}
            <div class="flex-1 flex items-center justify-center py-16">
              <span class="text-[13px] opacity-15">No connections</span>
            </div>
          {/each}
        </div>

        <!-- Add button -->
        <button
          class="mt-4 inline-flex items-center gap-2 text-[13px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
          onclick={() => (view = 'add')}
        >
          + Add connection
        </button>

      {:else if view === 'add'}
        <div in:fade={{ duration: 150 }}>
          <button
            class="text-[12px] opacity-40 hover:opacity-70 transition mb-6 bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
            onclick={() => { view = 'list'; error = '' }}
          >
            ← Back
          </button>

          <div class="text-2xl font-light tracking-tight mb-5">Add connection.</div>

          <div class="flex flex-col gap-2.5">
            <input
              type="text"
              bind:value={url}
              placeholder="Server URL"
              class="w-full px-4 py-2.5 bg-black/[0.04] dark:bg-white/[0.06] text-[13px] text-[#1d1d1f] dark:text-[#fafafa] placeholder:opacity-20 outline-none focus:bg-white/[0.1] transition no-drag border-none"
              onkeydown={(e) => e.key === 'Enter' && add()}
            />
            <input
              type="text"
              bind:value={name}
              placeholder="Label (optional)"
              class="w-full px-4 py-2.5 bg-black/[0.04] dark:bg-white/[0.06] text-[13px] text-[#1d1d1f] dark:text-[#fafafa] placeholder:opacity-20 outline-none focus:bg-white/[0.1] transition no-drag border-none"
            />
            {#if error}
              <span class="text-[11px] text-red-400 opacity-80">{error}</span>
            {/if}
            <button
              class="w-fit mt-2 inline-flex items-center gap-2 bg-white px-8 py-2.5 text-black text-[13px] transition hover:bg-gray-100 disabled:opacity-30 border-none"
              onclick={add}
              disabled={connecting}
            >
              {connecting ? 'Adding…' : 'Add'}
              {#if !connecting}
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
