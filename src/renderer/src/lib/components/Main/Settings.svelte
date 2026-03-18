<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { connections, config, appInfo } from '../../stores'

  interface Props {
    onClose: () => void
  }

  let { onClose }: Props = $props()

  let settingsTab = $state('general')
  let launchAtLogin = $state(false)

  onMount(async () => {
    launchAtLogin = await window.electronAPI.getLaunchAtLogin()
  })

  const setDefault = async (id: string) => {
    await window.electronAPI.setDefaultConnection(id)
    config.set(await window.electronAPI.getConfig())
  }

  const remove = async (id: string) => {
    await window.electronAPI.removeConnection(id)
    connections.set(await window.electronAPI.getConnections())
    config.set(await window.electronAPI.getConfig())
  }

  const updateConfig = async (key: string, value: any) => {
    const current = $config ?? {}
    const localServer = { ...(current.localServer ?? {}), [key]: value }
    await window.electronAPI.setConfig({ localServer })
    config.set(await window.electronAPI.getConfig())
  }

  const openGithub = () => {
    window.electronAPI?.openInBrowser?.('https://github.com/open-webui/desktop')
  }

  const tabs = [
    {
      id: 'general',
      label: 'General',
      icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z',
      extra: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
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

<div class="h-full w-full flex bg-[#0a0a0a] text-[#fafafa]" in:fade={{ duration: 150 }}>
  <!-- Settings sidebar -->
  <div class="w-[180px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[#111] px-1.5">
    <div class="h-4 shrink-0"></div>
    <div class="px-3 pb-3">
      <span class="text-[13px] opacity-60 font-medium">Settings</span>
    </div>

    <div class="flex flex-col gap-0.5 px-2">
      {#each tabs as tab}
        <button
          class="flex items-center gap-2 px-2.5 py-[6px] rounded-xl text-[12px] transition bg-transparent border-none text-[#fafafa] text-left w-full {settingsTab ===
          tab.id
            ? 'bg-white/[0.08] opacity-90'
            : 'opacity-40 hover:opacity-70 hover:bg-white/[0.03]'}"
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
    <div class="flex items-center justify-between px-8 pt-5 pb-3 border-b border-white/[0.04]">
      <span class="text-[15px] opacity-80 font-medium capitalize">{settingsTab}</span>
      <button
        class="opacity-30 hover:opacity-70 transition bg-transparent border-none text-[#fafafa]"
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
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    {#if settingsTab}
      <div class="flex-1 overflow-y-auto px-8 py-4">
        {#if settingsTab === 'general'}

          <div class="flex flex-col divide-y divide-white/[0.04]">
            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Default connection</div>
                <div class="text-[11px] opacity-25 mt-0.5">Connection used on launch</div>
              </div>
              <select
                class="bg-white/[0.06] text-[12px] text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
                onchange={(e) => setDefault((e.target as HTMLSelectElement).value)}
              >
                <option value="">None</option>
                {#each $connections as conn}
                  <option value={conn.id} selected={$config?.defaultConnectionId === conn.id}
                    >{conn.name}</option
                  >
                {/each}
              </select>
            </div>

            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Server port</div>
                <div class="text-[11px] opacity-25 mt-0.5">Port for local Open WebUI server</div>
              </div>
              <input
                type="number"
                class="bg-white/[0.06] text-[12px] text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 w-20 text-right"
                value={$config?.localServer?.port ?? 8080}
                onchange={(e) =>
                  updateConfig('port', parseInt((e.target as HTMLInputElement).value) || 8080)}
              />
            </div>

            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Serve on local network</div>
                <div class="text-[11px] opacity-25 mt-0.5">
                  Allow other devices on your network to connect
                </div>
              </div>
              <button
                class="w-9 h-5 rounded-full transition-colors {$config?.localServer
                  ?.serveOnLocalNetwork
                  ? 'bg-white/30'
                  : 'bg-white/[0.08]'} border-none relative"
                aria-label="Toggle serve on local network"
                onclick={() =>
                  updateConfig('serveOnLocalNetwork', !$config?.localServer?.serveOnLocalNetwork)}
              >
                <div
                  class="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all {$config
                    ?.localServer?.serveOnLocalNetwork
                    ? 'left-[18px]'
                    : 'left-[3px]'}"
                ></div>
              </button>
            </div>

            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Auto-update</div>
                <div class="text-[11px] opacity-25 mt-0.5">
                  Automatically update Open WebUI package
                </div>
              </div>
              <button
                class="w-9 h-5 rounded-full transition-colors {$config?.localServer?.autoUpdate !==
                false
                  ? 'bg-white/30'
                  : 'bg-white/[0.08]'} border-none relative"
                aria-label="Toggle auto-update"
                onclick={() =>
                  updateConfig('autoUpdate', $config?.localServer?.autoUpdate === false)}
              >
                <div
                  class="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all {$config
                    ?.localServer?.autoUpdate !== false
                    ? 'left-[18px]'
                    : 'left-[3px]'}"
                ></div>
              </button>
            </div>

            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Launch at login</div>
                <div class="text-[11px] opacity-25 mt-0.5">Open app when you log in</div>
              </div>
              <button
                class="w-9 h-5 rounded-full transition-colors {launchAtLogin
                  ? 'bg-white/30'
                  : 'bg-white/[0.08]'} border-none relative"
                aria-label="Toggle launch at login"
                onclick={async () => {
                  launchAtLogin = !launchAtLogin
                  await window.electronAPI.setLaunchAtLogin(launchAtLogin)
                }}
              >
                <div
                  class="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all {launchAtLogin
                    ? 'left-[18px]'
                    : 'left-[3px]'}"
                ></div>
              </button>
            </div>

            <div class="py-4 flex items-center justify-between">
              <div>
                <div class="text-[13px] opacity-70">Factory reset</div>
                <div class="text-[11px] opacity-25 mt-0.5">
                  Remove Python, packages, data &amp; connections
                </div>
              </div>
              <button
                class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl"
                onclick={() => {
                  if (
                    confirm(
                      'This will remove all installed components, data, and connections. The app will restart. Continue?'
                    )
                  ) {
                    window.electronAPI.resetApp()
                  }
                }}
              >
                Reset
              </button>
            </div>
          </div>
        {:else if settingsTab === 'connections'}

          <div class="flex flex-col divide-y divide-white/[0.04]">
            {#each $connections as conn}
              <div class="py-3 flex items-center justify-between">
                <div class="flex items-center gap-2.5 min-w-0">
                  <svg
                    class="w-[14px] h-[14px] shrink-0 opacity-30"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    {#if conn.type === 'local'}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
                      />
                    {:else}
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3"
                      />
                    {/if}
                  </svg>
                  <div class="min-w-0">
                    <div class="text-[13px] opacity-70 truncate">{conn.name}</div>
                    <div class="text-[11px] opacity-25 truncate mt-0.5">{conn.url}</div>
                  </div>
                </div>
                <button
                  class="text-[11px] opacity-30 hover:opacity-60 px-2 py-1 bg-transparent transition border-none text-[#fafafa] shrink-0"
                  onclick={() => remove(conn.id)}
                >
                  Remove
                </button>
              </div>
            {/each}

            {#if ($connections ?? []).length === 0}
              <div class="py-6 text-[12px] opacity-20 text-center">No connections</div>
            {/if}
          </div>
        {:else if settingsTab === 'about'}

          <div class="flex flex-col divide-y divide-white/[0.04]">
            <div class="py-4 flex items-center justify-between">
              <div class="text-[13px] opacity-70">Version</div>
              <div class="text-[12px] opacity-30">{$appInfo?.version ?? 'Unknown'}</div>
            </div>

            <div class="py-4 flex items-center justify-between">
              <div class="text-[13px] opacity-70">Platform</div>
              <div class="text-[12px] opacity-30">{$appInfo?.platform ?? 'Unknown'}</div>
            </div>

            <div class="py-4">
              <button
                class="text-[12px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#fafafa]"
                onclick={openGithub}
              >
                View on GitHub →
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
