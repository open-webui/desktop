<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { connections, config, appInfo } from '../stores'
  import { tooltip } from '../actions/tooltip'
  import i18n from '../i18n'
  import Connections from './Main/Connections.svelte'
  import Settings from './Main/Settings.svelte'

  let visible = $state(false)
  let settingsOpen = $state(false)
  let sidebarOpen = $state(true)
  let activeConnectionName = $state('')

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
    class="h-full w-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa] relative"
    in:fade={{ duration: 200 }}
  >
    <!-- Persistent top bar -->
    <div
      class="flex items-center shrink-0 drag-region {$appInfo?.platform === 'darwin'
        ? 'h-10'
        : 'h-8'}"
    >
      <div
        class="flex items-center gap-1 {$appInfo?.platform === 'darwin'
          ? 'pl-25'
          : 'pl-3'} pr-2 shrink-0 translate-y-[0.5px]"
      >
        <button
          class="opacity-70 hover:opacity-100 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] no-drag"
          onclick={() => (sidebarOpen = !sidebarOpen)}
          use:tooltip={sidebarOpen ? $i18n.t('sidebar.tooltip.closeSidebar') : $i18n.t('sidebar.tooltip.openSidebar')}
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

        {#if activeConnectionName}
          <button
            class="opacity-40 hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] no-drag cursor-pointer"
            onclick={() => {
              const wv = document.querySelector('webview[style*="display: flex"]') as any
              if (wv?.goBack) wv.goBack()
            }}
          >
            <svg class="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            class="opacity-40 hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] no-drag cursor-pointer"
            onclick={() => {
              const wv = document.querySelector('webview[style*="display: flex"]') as any
              if (wv?.goForward) wv.goForward()
            }}
          >
            <svg class="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        {/if}
      </div>
      <div class="flex-1 flex items-center justify-center">
        <span class="text-[11px] opacity-80">{activeConnectionName || $i18n.t('app.name')}</span>
      </div>
      <div class="pr-3 flex items-center shrink-0 translate-y-[0.5px]">
        {#if activeConnectionName}
          <button
            class="opacity-40 hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] no-drag cursor-pointer"
            onclick={() => {
              const wv = document.querySelector('webview[style*="display: flex"]') as any
              if (wv?.reload) wv.reload()
            }}
            use:tooltip={$i18n.t('common.refresh')}
          >
            <svg class="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Content area below top bar -->
    <div class="flex-1 min-h-0">
      <Connections
        {sidebarOpen}
        bind:activeConnectionName
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
          class="w-[calc(100%-32px)] h-[calc(100%-32px)] max-w-[900px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl border border-black/[0.08] dark:border-white/[0.08]"
          in:fade={{ duration: 150 }}
          onclick={(e) => e.stopPropagation()}
        >
          <Settings onClose={() => (settingsOpen = false)} />
        </div>
      </div>
    {/if}
  </div>
{/if}
