<script lang="ts">
  import { fade } from 'svelte/transition'
  import { appInfo, serverInfo, desktopUpdate } from '../stores'
  import Connections from './Main/Connections.svelte'
  import Settings from './Main/Settings.svelte'
  import i18n from '../i18n'

  let settingsOpen = $state(false)
  let settingsTab = $state('general')
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
    <Connections onOpenSettings={() => { settingsTab = 'general'; settingsOpen = true }} />
  </div>

  {#if $desktopUpdate.status === 'available' || $desktopUpdate.status === 'downloaded'}
    <button
      type="button"
      class="shrink-0 border-t border-black/5 dark:border-white/10 px-4 py-2 text-[12px] text-center hover:bg-black/5 dark:hover:bg-white/5"
      onclick={() => { settingsTab = 'about'; settingsOpen = true }}
    >
      {$desktopUpdate.status === 'downloaded'
        ? $i18n.t('settings.about.updateReady')
        : $i18n.t('settings.about.versionAvailable', { version: $desktopUpdate.version })}
    </button>
  {/if}

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
        <Settings initialTab={settingsTab} onClose={() => (settingsOpen = false)} />
      </div>
    </div>
  {/if}
</div>
