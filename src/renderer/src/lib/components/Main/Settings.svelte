<script lang="ts">
  import { fade } from 'svelte/transition'

  import General from './Settings/General.svelte'
  import OpenWebUI from './Settings/OpenWebUI.svelte'
  import Connections from './Settings/Connections.svelte'
  import OpenTerminal from './Settings/OpenTerminal.svelte'
  import InferenceRuntime from './Settings/InferenceRuntime.svelte'
  import Models from './Settings/Models.svelte'
  import About from './Settings/About.svelte'

  interface Props {
    onClose: () => void
  }

  let { onClose }: Props = $props()

  let settingsTab = $state('general')

  const tabs = [
    {
      id: 'general',
      label: 'General',
      icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z',
      extra: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
    },
    {
      id: 'openwebui',
      label: 'Open WebUI',
      icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      extra: 'M9 3.51a9.012 9.012 0 016 0M9 20.49a9.012 9.012 0 006 0M3.51 9a9.012 9.012 0 000 6M20.49 9a9.012 9.012 0 010 6M12 3v18M3 12h18'
    },
    {
      id: 'terminal',
      label: 'Open Terminal',
      icon: 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'
    },
    {
      id: 'inference',
      label: 'Inference Runtime',
      icon: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z'
    },
    {
      id: 'models',
      label: 'Models',
      icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125'
    },
    {
      id: 'connections',
      label: 'Connections',
      icon: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418'
    },
    {
      id: 'about',
      label: 'About',
      icon: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z'
    }
  ]
</script>

<div class="h-full w-full flex bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]" in:fade={{ duration: 150 }}>
  <!-- Settings sidebar -->
  <div class="w-[180px] shrink-0 flex flex-col border-r border-black/[0.06] dark:border-white/[0.06] bg-[#eee] dark:bg-[#111] px-1.5">
    <div class="h-4 shrink-0"></div>
    <div class="px-3 pb-3">
      <span class="text-[13px] opacity-60 font-medium">Settings</span>
    </div>

    <div class="flex flex-col gap-0.5 px-1">
      {#each tabs as tab}
        <button
          class="flex items-center gap-2 px-2.5 py-[6px] rounded-2xl text-[12px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] text-left w-full {settingsTab ===
          tab.id
            ? 'bg-black/[0.06] dark:bg-white/[0.08] opacity-90'
            : 'opacity-40 hover:opacity-70 hover:bg-black/[0.02] dark:bg-white/[0.03]'}"
          onclick={() => (settingsTab = tab.id)}
        >
          <svg
            class="w-[14px] h-[14px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
            {#if tab.extra}
              <path stroke-linecap="round" stroke-linejoin="round" d={tab.extra} />
            {/if}
          </svg>
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
    <!-- Content header -->
    <div class="flex items-center justify-between px-8 pt-5 pb-3 border-b border-black/[0.04] dark:border-white/[0.04]">
      <span class="text-[15px] opacity-80 font-medium">{tabs.find(t => t.id === settingsTab)?.label ?? settingsTab}</span>
      <button
        class="opacity-30 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
        onclick={onClose}
        title="Close settings"
      >
        <svg
          class="w-[14px] h-[14px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-8 py-4">
      {#if settingsTab === 'general'}
        <General />
      {:else if settingsTab === 'openwebui'}
        <OpenWebUI />
      {:else if settingsTab === 'connections'}
        <Connections />
      {:else if settingsTab === 'terminal'}
        <OpenTerminal />
      {:else if settingsTab === 'inference'}
        <InferenceRuntime />
      {:else if settingsTab === 'models'}
        <Models />
      {:else if settingsTab === 'about'}
        <About />
      {/if}
    </div>
  </div>
</div>
