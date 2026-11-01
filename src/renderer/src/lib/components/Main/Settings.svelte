<script lang="ts">
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
  import Models from './Settings/Models.svelte'
  import About from './Settings/About.svelte'

  let { onClose }: { onClose: () => void } = $props()
  let settingsTab = $state('general')
  let search = $state('')
  let showSearch = $state(false)

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
        ...Object.entries(translations)
          .filter(([key]) => key.startsWith(`settings.${tab.id}.`))
          .map(([, value]) => String(value))
      ].some((text) => text.toLocaleLowerCase().includes(query))
    )
  })
</script>

<div
  class="flex h-full w-full min-h-0 flex-col bg-white text-[12px] leading-normal text-gray-900 md:flex-row dark:bg-gray-900 dark:text-gray-100 dark:[color-scheme:dark] [&_:is(button,input,select,textarea):focus-visible]:outline-2 [&_:is(button,input,select,textarea):focus-visible]:outline-offset-2 [&_:is(button,input,select,textarea):focus-visible]:outline-blue-500 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none"
  in:fade={{ duration: 150 }}
>
  <nav
    class="flex min-w-0 shrink-0 flex-col border-b border-gray-100/30 md:min-h-0 md:w-[208px] md:border-r md:border-b-0 dark:border-white/[0.02]"
    aria-label={$i18n.t('settings.title')}
  >
    <div class="m-1 flex shrink-0 items-center gap-1 md:mb-0">
      <button
        type="button"
        class="flex h-[28px] flex-1 items-center gap-1.5 rounded-lg px-2 text-gray-800 transition-colors duration-75 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        onclick={onClose}
      >
        <span class="inline-flex size-[12px] shrink-0 [&>svg]:size-full" aria-hidden="true"
          >{@html NavArrowLeftIcon}</span
        >
        {$i18n.t('settings.back')}
      </button>
      <button
        type="button"
        class="flex size-[28px] shrink-0 items-center justify-center rounded-lg text-gray-800 hover:bg-gray-50 md:hidden dark:text-gray-400 dark:hover:bg-white/[0.04]"
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
      class="mx-1 mb-0.5 h-[28px] shrink-0 items-center gap-1.5 rounded-lg bg-gray-50/70 px-2 md:mt-1 md:flex dark:bg-white/[0.03] {showSearch ||
      search
        ? 'flex'
        : 'hidden'}"
    >
      <span class="inline-flex size-[14px] shrink-0 [&>svg]:size-full" aria-hidden="true"
        >{@html SearchIcon}</span
      >
      <input
        id="settings-search"
        aria-label={$i18n.t('settings.search')}
        class="w-full min-w-0 bg-transparent py-1 outline-none placeholder:text-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
        bind:value={search}
        placeholder={$i18n.t('settings.search')}
        onkeydown={(event) => {
          if (event.key === 'Enter' && filteredTabs[0]) settingsTab = filteredTabs[0].id
        }}
      />
    </div>

    <div
      class="flex min-h-0 min-w-0 flex-1 gap-px overflow-x-auto p-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto"
    >
      {#each filteredTabs as tab, index (tab.id)}
        {#if tab.group && (index === 0 || filteredTabs[index - 1].group !== tab.group)}
          <div
            class="hidden shrink-0 px-2 text-[10px] text-gray-800 md:block dark:text-gray-400 {index ===
            0
              ? 'mt-0.5'
              : 'mt-2'} mb-0.5"
          >
            {$i18n.t(`settings.groups.${tab.group}`)}
          </div>
        {/if}
        <button
          type="button"
          class="flex h-[28px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-left transition-colors duration-75 md:w-full {settingsTab ===
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
        <div role="status" class="px-2 py-1 text-gray-800 dark:text-gray-400">
          {$i18n.t('settings.noMatches')}
        </div>
      {/each}
    </div>
  </nav>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col p-[16px] md:px-[20px]">
    <h2
      id="settings-heading"
      class="mb-[16px] shrink-0 text-[14px] font-medium text-gray-900 dark:text-white"
    >
      {$i18n.t(`settings.tabs.${settingsTab}`)}
    </h2>
    {#key settingsTab}
      <section aria-labelledby="settings-heading" class="min-h-0 flex-1 overflow-y-auto pr-1.5">
        {#if settingsTab === 'general'}
          <General />
        {:else if settingsTab === 'openwebui'}
          <OpenWebUI />
        {:else if settingsTab === 'inference'}
          <InferenceRuntime />
        {:else if settingsTab === 'models'}
          <Models />
        {:else if settingsTab === 'about'}
          <About />
        {/if}
      </section>
    {/key}
  </div>
</div>
