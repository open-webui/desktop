<script lang="ts">
  import { fade, scale } from 'svelte/transition'
  import i18n from '../../../i18n'

  interface Props {
    url: string
    connecting: boolean
    error: string
    allowSelfSigned: boolean
    onConnect: () => void
    onCancel: () => void
  }

  let {
    url = $bindable(''),
    connecting = $bindable(false),
    error = $bindable(''),
    allowSelfSigned = $bindable(false),
    onConnect,
    onCancel
  }: Props = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center"
  transition:fade={{ duration: 150 }}
  onmousedown={onCancel}
>
  <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

  <div
    class="relative mx-4 w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-950"
    transition:scale={{ start: 0.97, duration: 180 }}
    onmousedown={(e) => e.stopPropagation()}
  >
    <!-- Visual header -->
    <div
      class="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-gray-200"
    >
      <div
        class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
      ></div>
      <div class="relative z-10 text-center">
        <div class="mb-2.5 flex justify-center">
          <div class="rounded-full bg-white/10 p-3 dark:bg-black/10">
            <svg
              class="w-6 h-6 text-white dark:text-gray-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
              />
            </svg>
          </div>
        </div>
        <h2 class="text-lg font-semibold tracking-tight text-white dark:text-gray-900">
          {$i18n.t('setup.newConnection')}
        </h2>
        <p class="mt-1 text-xs text-white/60 dark:text-gray-900/50">
          {$i18n.t('setup.newConnectionDesc')}
        </p>
      </div>
    </div>

    <!-- Body -->
    <div class="px-6 py-5">
      <label class="block text-[11px] text-gray-400 dark:text-gray-500"
        >{$i18n.t('setup.connectionManager.serverUrl')}</label
      >
      <input
        type="text"
        bind:value={url}
        placeholder="https://"
        class="w-full py-2 text-[14px] text-[#1d1d1f] dark:text-[#fafafa] placeholder:opacity-20 outline-none bg-transparent border-none border-b border-black/[0.08] dark:border-white/[0.08]"
        onkeydown={(e) => e.key === 'Enter' && onConnect()}
      />

      {#if error}
        <p class="mt-2 text-[11px] text-red-400">{error}</p>
      {/if}

      <label class="mt-4 flex items-start gap-2.5 text-[12px] text-gray-500 dark:text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={allowSelfSigned}
          class="mt-0.5 h-3.5 w-3.5 rounded border border-black/20 dark:border-white/20 bg-transparent"
        />
        <span>
          {$i18n.t('setup.selfHostAllowSelfSigned')}
          <span class="block mt-0.5 text-[11px] opacity-70">{$i18n.t('setup.selfHostAllowSelfSignedDesc')}</span>
        </span>
      </label>
    </div>

    <!-- Footer -->
    <div class="px-5 pb-5 flex flex-col gap-2">
      <button
        class="w-full rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] border-none cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:active:scale-100"
        onclick={onConnect}
        disabled={connecting || !url.trim()}
      >
        {#if connecting}
          <span class="inline-flex items-center gap-2">
            <span
              class="w-3.5 h-3.5 rounded-full border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black animate-spin inline-block"
            ></span>
            {$i18n.t('common.connecting')}
          </span>
        {:else}
          {$i18n.t('common.connect')}
        {/if}
      </button>
      <button
        class="w-full rounded-xl px-4 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition bg-transparent border-none cursor-pointer"
        onclick={onCancel}
      >
        {$i18n.t('common.cancel')}
      </button>
    </div>
  </div>
</div>
