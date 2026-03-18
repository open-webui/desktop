<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { connections, config, appInfo } from '../stores'
  import { tooltip } from '../actions/tooltip'
  import Connections from './Main/Connections.svelte'
  import Settings from './Main/Settings.svelte'

  let visible = $state(false)
  let settingsOpen = $state(false)
  let sidebarOpen = $state(true)
  let activeConnectionName = $state('')
  let isLocalConnection = $state(false)
  let showingLogs = $state(false)

  onMount(async () => {
    connections.set(await window.electronAPI.getConnections())
    config.set(await window.electronAPI.getConfig())
    setTimeout(() => {
      visible = true
    }, 50)
  })
</script>

{#if visible}
  <div
    class="h-full w-full flex flex-col bg-[#0a0a0a] text-[#fafafa] relative"
    in:fade={{ duration: 200 }}
  >
    <!-- Persistent top bar -->
    <div
      class="flex items-center shrink-0 drag-region {$appInfo?.platform === 'darwin'
        ? 'h-10'
        : 'h-8'}"
    >
      <div
        class="flex items-center {$appInfo?.platform === 'darwin'
          ? 'pl-25'
          : 'pl-3'} pr-2 shrink-0 translate-y-[0.5px]"
      >
        <button
          class="opacity-70 hover:opacity-100 transition bg-transparent border-none text-[#fafafa] no-drag"
          onclick={() => (sidebarOpen = !sidebarOpen)}
          use:tooltip={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <svg
            class="w-[15px] h-[15px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 3.75h16.5v16.5H3.75V3.75zM9 3.75v16.5"
            />
          </svg>
        </button>
      </div>
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[11px] opacity-80">{activeConnectionName || 'Open WebUI'}</span>
      </div>
      {#if isLocalConnection}
        <div class="pr-3 shrink-0 flex items-center">
          <button
            class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#fafafa] no-drag"
            onclick={() => (showingLogs = !showingLogs)}
            use:tooltip={showingLogs ? 'Back to Open WebUI' : 'Show logs'}
          >
            <svg
              class="w-[14px] h-[14px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              {#if showingLogs}
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                />
              {:else}
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
                />
              {/if}
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <!-- Content area below top bar -->
    <div class="flex-1 min-h-0">
      <Connections
        {sidebarOpen}
        bind:activeConnectionName
        bind:isLocalConnection
        bind:showingLogs
        onOpenSettings={() => (settingsOpen = true)}
      />
    </div>

    {#if settingsOpen}
      <div
        class="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        in:fade={{ duration: 150 }}
        out:fade={{ duration: 100 }}
        onclick={() => (settingsOpen = false)}
        role="button"
        tabindex="-1"
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="w-[calc(100%-32px)] h-[calc(100%-32px)] max-w-[900px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08]"
          in:fade={{ duration: 150 }}
          onclick={(e) => e.stopPropagation()}
        >
          <Settings onClose={() => (settingsOpen = false)} />
        </div>
      </div>
    {/if}
  </div>
{/if}
