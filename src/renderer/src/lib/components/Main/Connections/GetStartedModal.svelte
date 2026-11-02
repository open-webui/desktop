<script lang="ts">
  import NavArrowRightIcon from 'iconoir/icons/nav-arrow-right.svg?raw'
  import ViewGridIcon from 'iconoir/icons/view-grid.svg?raw'
  import { onMount } from 'svelte'
  import { fade, scale } from 'svelte/transition'
  import i18n from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  interface Props {
    onContinue: (options: { installLlamaCpp: boolean; installOllama: boolean; installDir: string }) => void
    onCancel: () => void
  }

  let { onContinue, onCancel }: Props = $props()

  let installOllama = $state(false)
  let installLlamaCpp = $state(false)
  let installDir = $state('')
  let defaultInstallDir = $state('')
  let advancedOpen = $state(false)

  onMount(async () => {
    defaultInstallDir = await window.electronAPI.getInstallDir()
    installDir = defaultInstallDir
  })

  const changeInstallDir = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (folder) {
      installDir = folder
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-[56px]"
  transition:fade={{ duration: 150 }}
  onmousedown={onCancel}
>
  <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

  <div
    class="relative w-full max-w-xl max-h-full overflow-y-auto rounded-3xl bg-white shadow-2xl dark:bg-gray-950"
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
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-6 h-6 text-white dark:text-gray-900">{@html ViewGridIcon}</span>
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
      <div class="py-3.5 flex items-center justify-between gap-4">
        <div>
          <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300">Ollama</div>
          <div class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{$i18n.t('settings.ollama.description')}</div>
        </div>
        <Switch label="Ollama" checked={installOllama} onchange={(value) => { installOllama = value }} />
      </div>
    </div>

    <!-- Advanced (collapsed) -->
    <div class="px-6 pb-4">
      <button
        class="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer"
        onclick={() => { advancedOpen = !advancedOpen }}
      >
        <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-2.5 h-2.5 text-gray-400 dark:text-gray-500 transition-transform duration-200 {advancedOpen ? 'rotate-90' : ''}">{@html NavArrowRightIcon}</span>
        <span class="text-[11px] text-gray-400 dark:text-gray-500">{$i18n.t('common.advanced')}</span>
      </button>

      {#if advancedOpen}
        <div class="mt-3">
          <div class="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">{$i18n.t('setup.install.installLocation')}</div>
          <div class="flex items-center gap-2">
            <div
              class="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-gray-900 text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate rounded-xl"
              title={installDir}
            >
              {installDir || '…'}
            </div>
            <button
              class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl transition border-none cursor-pointer"
              onclick={changeInstallDir}
            >
              {$i18n.t('setup.install.changeLocation')}
            </button>
          </div>
          <div class="text-[10px] text-gray-300 dark:text-gray-600 mt-1">{$i18n.t('setup.install.installLocationDesc')}</div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-5 pb-5 pt-1 flex flex-col gap-2">
      <button
        class="w-full rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] border-none cursor-pointer"
        onclick={() => onContinue({ installLlamaCpp, installOllama, installDir })}
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

