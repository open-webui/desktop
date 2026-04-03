<script lang="ts">
  import { fade, scale } from 'svelte/transition'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  interface Props {
    onContinue: (options: { installOpenTerminal: boolean; installLlamaCpp: boolean }) => void
    onCancel: () => void
  }

  let { onContinue, onCancel }: Props = $props()

  let installOpenTerminal = $state(true)
  let installLlamaCpp = $state(true)
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
    class="relative mx-4 w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-950"
    transition:scale={{ start: 0.97, duration: 180 }}
    onmousedown={(e) => e.stopPropagation()}
  >
    <!-- Visual header -->
    <div
      class="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black dark:from-white dark:via-gray-100 dark:to-gray-200"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
      <div class="relative z-10 text-center">
        <div class="mb-2.5 flex justify-center">
          <div class="rounded-full bg-white/10 p-3 dark:bg-black/10">
            <svg class="w-6 h-6 text-white dark:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
            </svg>
          </div>
        </div>
        <h2 class="text-lg font-semibold tracking-tight text-white dark:text-gray-900">
          {$i18n.t('main.getStarted.title')}
        </h2>
        <p class="mt-1 text-xs text-white/60 dark:text-gray-900/50">
          {$i18n.t('main.getStarted.description')}
        </p>
      </div>
    </div>

    <!-- Options -->
    <div class="px-6 py-4 flex flex-col divide-y divide-gray-100/30 dark:divide-gray-800/15">
      <div class="py-3.5 flex items-center justify-between gap-4">
        <div>
          <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300">{$i18n.t('main.getStarted.openTerminal')}</div>
          <div class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{$i18n.t('main.getStarted.openTerminalDesc')}</div>
        </div>
        <Switch
          checked={installOpenTerminal}
          onchange={(v) => { installOpenTerminal = v }}
        />
      </div>

      <div class="py-3.5 flex items-center justify-between gap-4">
        <div>
          <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            {$i18n.t('main.getStarted.llamaCpp')}
            <span class="text-[9px] opacity-30 uppercase tracking-wide">{$i18n.t('common.experimental')}</span>
          </div>
          <div class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{$i18n.t('main.getStarted.llamaCppDesc')}</div>
        </div>
        <Switch
          checked={installLlamaCpp}
          onchange={(v) => { installLlamaCpp = v }}
        />
      </div>
    </div>

    <!-- Footer -->
    <div class="px-5 pb-5 flex flex-col gap-2">
      <button
        class="w-full rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] border-none cursor-pointer"
        onclick={() => onContinue({ installOpenTerminal, installLlamaCpp })}
      >
        {$i18n.t('main.getStarted.continue')}
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

