<script lang="ts">
  import { fade } from 'svelte/transition'
  import { appInfo } from '../stores'
  import Connections from './Main/Connections.svelte'
  import Settings from './Main/Settings.svelte'

  let settingsOpen = $state(false)
</script>

<div
  class="h-full w-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa] relative"
  in:fade={{ duration: 200 }}
>
  <div
    class="absolute inset-x-0 top-0 z-40 drag-region {$appInfo?.platform === 'darwin' ? 'h-[40px]' : 'h-[32px]'}"
    aria-hidden="true"
  ></div>
  <!-- Local launcher -->
  <div class="flex-1 min-h-0">
    <Connections onOpenSettings={() => (settingsOpen = true)} />
  </div>

  {#if settingsOpen}
    <div
      class="absolute inset-0 z-50 flex items-center justify-center p-[56px] bg-black/60 backdrop-blur-sm"
      in:fade={{ duration: 150 }}
      out:fade={{ duration: 100 }}
      onclick={() => (settingsOpen = false)}
      role="button"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="w-full h-full max-w-[900px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl border border-black/[0.08] dark:border-white/[0.08]"
        in:fade={{ duration: 150 }}
        onclick={(e) => e.stopPropagation()}
      >
        <Settings onClose={() => (settingsOpen = false)} />
      </div>
    </div>
  {/if}
</div>
