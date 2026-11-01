<script lang="ts">
  import { fade } from 'svelte/transition'
  import { appInfo, serverInfo } from '../stores'
  import Connections from './Main/Connections.svelte'
  import Settings from './Main/Settings.svelte'

  let settingsOpen = $state(false)
</script>

<svelte:window
  onkeydown={(event) => {
    if (settingsOpen && event.key === 'Escape' && !event.defaultPrevented) settingsOpen = false
  }}
/>

<div
  class="h-full w-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa] relative"
  style:--window-drag-height={$appInfo?.platform === 'darwin' ? ($serverInfo?.reachable ? '28px' : '40px') : '32px'}
  style:--window-title-padding={$appInfo?.platform === 'darwin' ? '80px' : 'max(80px, calc(100vw - env(titlebar-area-width, calc(100vw - 138px)) + 8px))'}
  in:fade={{ duration: 200 }}
>
  <div
    class="absolute inset-x-0 top-0 z-40 drag-region"
    style:height="var(--window-drag-height)"
    aria-hidden="true"
  ></div>
  <!-- Local launcher -->
  <div class="flex-1 min-h-0">
    <Connections onOpenSettings={() => (settingsOpen = true)} />
  </div>

  {#if settingsOpen}
    <div
      class="absolute inset-0 z-50 flex items-center justify-center p-[16px] sm:p-[24px] lg:p-[32px] bg-black/60 backdrop-blur-sm"
      in:fade={{ duration: 150 }}
      out:fade={{ duration: 100 }}
      onclick={() => (settingsOpen = false)}
      role="button"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="w-full h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] rounded-[32px] overflow-hidden shadow-2xl"
        in:fade={{ duration: 150 }}
        onclick={(e) => e.stopPropagation()}
      >
        <Settings onClose={() => (settingsOpen = false)} />
      </div>
    </div>
  {/if}
</div>
