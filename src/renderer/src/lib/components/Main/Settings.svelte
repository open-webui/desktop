<script lang="ts">
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import NavArrowLeftIcon from 'iconoir/icons/nav-arrow-left.svg?raw'
  import SearchIcon from 'iconoir/icons/search.svg?raw'
  import InfoCircleIcon from 'iconoir/icons/info-circle.svg?raw'
  import DatabaseIcon from 'iconoir/icons/database.svg?raw'
  import CpuIcon from 'iconoir/icons/cpu.svg?raw'
  import GlobeIcon from 'iconoir/icons/globe.svg?raw'
  import SettingsIcon from 'iconoir/icons/settings.svg?raw'
  import { fade } from 'svelte/transition'
  import i18n from '../../i18n'

  import General from './Settings/General.svelte'
  import OpenWebUI from './Settings/OpenWebUI.svelte'
  import InferenceRuntime from './Settings/InferenceRuntime.svelte'
  import Ollama from './Settings/Ollama.svelte'
  import Models from './Settings/Models.svelte'
  import About from './Settings/About.svelte'

  let { onClose, settingsTab = $bindable('general') }: { onClose: () => void; settingsTab?: string } = $props()
  let search = $state('')
  let showSearch = $state(false)
  let runtime = $state('llamacpp')
  const runtimes = [
    { id: 'llamacpp', label: 'llama.cpp' },
    { id: 'ollama', label: 'Ollama' }
  ]

  const tabs = [
    { id: 'general', icon: SettingsIcon, group: 'basics' },
    { id: 'openwebui', icon: GlobeIcon, group: 'services' },
    { id: 'inference', icon: CpuIcon, group: 'services' },
    { id: 'models', icon: DatabaseIcon, group: 'data' },
    { id: 'about', icon: InfoCircleIcon, group: null }
  ] as const

  const filteredTabs = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase()
    const translations =
      $i18n.getResourceBundle($i18n.resolvedLanguage ?? 'en-US', 'translation') ?? {}
    return tabs.filter((tab) =>
      [
        $i18n.t(`settings.tabs.${tab.id}`),
        ...(tab.id === 'inference' ? runtimes.map((runtime) => runtime.label) : []),
        ...Object.entries(translations)
          .filter(([key]) => key.startsWith(`settings.${tab.id}.`) || (tab.id === 'inference' && key.startsWith('settings.ollama.')))
          .map(([, value]) => String(value))
      ].some((text) => text.toLocaleLowerCase().includes(query))
    )
  })
</script>

<div
  class="flex h-full w-full min-h-0 flex-col bg-white text-[12px] leading-[16px] text-[oklch(0.2_0_0)] md:flex-row dark:bg-[oklch(0.2_0_0)] dark:text-[oklch(0.85_0_0)] dark:[color-scheme:dark] [&_:is(button,input,select,textarea):focus-visible]:outline-2 [&_:is(button,input,select,textarea):focus-visible]:outline-offset-2 [&_:is(button,input,select,textarea):focus-visible]:outline-blue-500 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none"
  in:fade={{ duration: 150 }}
>
  <nav
    class="flex min-w-0 shrink-0 flex-col md:min-h-0 md:w-[208px]"
    aria-label={$i18n.t('settings.title')}
  >
    <div class="m-1 flex shrink-0 items-center gap-1 md:mb-0">
      <button
        type="button"
        class="flex h-[28px] flex-1 items-center gap-[6px] rounded-[8px] px-[8px] text-gray-800 transition-colors duration-75 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        onclick={onClose}
      >
        <span class="inline-flex size-[12px] shrink-0 [&>svg]:size-full" aria-hidden="true"
          >{@html NavArrowLeftIcon}</span
        >
        {$i18n.t('settings.back')}
      </button>
      <button
        type="button"
        class="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[oklch(0.51_0_0)] hover:text-[oklch(0.42_0_0)] md:hidden dark:text-[oklch(0.69_0_0)] dark:hover:text-[oklch(0.85_0_0)]"
        aria-label={$i18n.t('settings.search')}
        aria-expanded={showSearch || !!search}
        aria-controls="settings-search"
        onclick={() => (showSearch = !showSearch)}
      >
        <span class="inline-flex size-[14px] [&>svg]:size-full" aria-hidden="true"
          >{@html SearchIcon}</span
        >
      </button>
    </div>

    <div
      class="relative mx-[4px] mb-[2px] h-[28px] shrink-0 md:mt-[4px] md:flex {showSearch ||
      search
        ? 'flex'
        : 'hidden'}"
    >
      <span class="pointer-events-none absolute left-[8px] top-1/2 inline-flex size-[14px] -translate-y-1/2 [&>svg]:size-full" aria-hidden="true"
        >{@html SearchIcon}</span
      >
      <input
        id="settings-search"
        aria-label={$i18n.t('settings.search')}
        class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] w-full min-w-0 pl-[30px]"
        bind:value={search}
        placeholder={$i18n.t('settings.search')}
        onkeydown={(event) => {
          if (event.key === 'Enter' && filteredTabs[0]) settingsTab = filteredTabs[0].id
        }}
      />
    </div>

    <div
      class="flex min-h-0 min-w-0 flex-1 gap-px overflow-x-auto p-1 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden md:flex-col md:overflow-x-hidden md:overflow-y-auto"
    >
      {#each filteredTabs as tab, index (tab.id)}
        {#if tab.group && (index === 0 || filteredTabs[index - 1].group !== tab.group)}
          <div
            class="hidden shrink-0 px-[8px] text-[10px] text-gray-800 md:block dark:text-gray-400 {index ===
            0
              ? 'mt-0.5'
              : 'mt-2'} mb-0.5"
          >
            {$i18n.t(`settings.groups.${tab.group}`)}
          </div>
        {/if}
        <button
          type="button"
          class="flex h-[28px] shrink-0 items-center gap-[6px] rounded-[8px] px-[8px] text-left transition-colors duration-75 md:w-full {settingsTab ===
          tab.id
            ? 'bg-gray-50 font-medium text-gray-900 dark:bg-white/[0.04] dark:text-white'
            : 'text-gray-800 hover:text-gray-900 dark:text-gray-200 dark:hover:text-gray-100'}"
          aria-current={settingsTab === tab.id ? 'page' : undefined}
          onclick={() => (settingsTab = tab.id)}
        >
          <span class="inline-flex size-[14px] shrink-0 [&>svg]:size-full" aria-hidden="true"
            >{@html tab.icon}</span
          >
          {$i18n.t(`settings.tabs.${tab.id}`)}
        </button>
      {:else}
        <div role="status" class="px-[8px] py-1 text-gray-800 dark:text-gray-400">
          {$i18n.t('settings.noMatches')}
        </div>
      {/each}
    </div>
  </nav>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col p-[16px] md:px-[20px]">
    <div class="mb-[16px] flex shrink-0 flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]">
      <h2
        id="settings-heading"
        class="text-[14px] leading-[20px] font-medium text-gray-900 dark:text-white"
      >
        {$i18n.t(`settings.tabs.${settingsTab}`)}
      </h2>
      {#if settingsTab === 'inference'}
        <div class="relative inline-flex max-w-full shrink-0">
          <select
            id="inference-runtime"
            aria-label={$i18n.t('settings.tabs.inference')}
            aria-controls="inference-runtime-content"
            bind:value={runtime}
            class="h-[28px] max-w-full appearance-none truncate rounded-[8px] border border-gray-100/50 bg-gray-50/40 ps-[10px] pe-[32px] text-[12px] leading-[16px] font-normal text-gray-700 outline-hidden [field-sizing:content] transition-colors focus:border-blue-400 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-300 dark:focus:border-blue-500"
          >
            {#each runtimes as item}
              <option value={item.id}>{item.label}</option>
            {/each}
          </select>
          <span aria-hidden="true" class="pointer-events-none absolute right-[8px] top-1/2 inline-flex size-[14px] -translate-y-1/2 text-gray-400 dark:text-gray-500 [&>svg]:size-full">
            {@html NavArrowDownIcon}
          </span>
        </div>
      {/if}
    </div>
    {#key settingsTab}
      <section aria-labelledby="settings-heading" class="min-h-0 flex-1 overflow-y-auto pr-[6px]">
        {#if settingsTab === 'general'}
          <General />
        {:else if settingsTab === 'openwebui'}
          <OpenWebUI />
        {:else if settingsTab === 'inference'}
          <div id="inference-runtime-content">
            {#if runtime === 'llamacpp'}
              <InferenceRuntime />
            {:else}
              <Ollama />
            {/if}
          </div>
        {:else if settingsTab === 'models'}
          <Models />
        {:else if settingsTab === 'about'}
          <About />
        {/if}
      </section>
    {/key}
  </div>
</div>
