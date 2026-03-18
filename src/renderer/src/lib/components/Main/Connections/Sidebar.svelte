<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { connections, config, appInfo, serverInfo } from '../../../stores'
  import i18n from '../../../i18n'
  import { tooltip } from '../../../actions/tooltip'

  interface Props {
    activeConnectionId: string
    localConn: any
    localInstalled: boolean
    remoteConnections: any[]
    serverStatus: string | undefined
    serverReachable: boolean | undefined
    openTerminalStatus: string | null
    llamaCppStatus: string | null
    settingsOpen: boolean
    view: string
    onConnect: (id: string) => void
    onDisconnect: () => void
    onAddView: () => void
    onOpenSettings: () => void
    onToggleOpenTerminal: () => void
    onToggleOtLogs: () => void
    onToggleLlamaCpp: () => void
    onToggleLlamaCppLogs: () => void
    onRename: (id: string, name: string) => void
    onRemove: (id: string) => void
    openGithub: () => void
  }

  let {
    activeConnectionId,
    localConn,
    localInstalled,
    remoteConnections,
    serverStatus,
    serverReachable,
    openTerminalStatus,
    llamaCppStatus,
    settingsOpen = $bindable(false),
    view,
    onConnect,
    onDisconnect,
    onAddView,
    onOpenSettings,
    onToggleOpenTerminal,
    onToggleOtLogs,
    onToggleLlamaCpp,
    onToggleLlamaCppLogs,
    onRename,
    onRemove,
    openGithub
  }: Props = $props()

  // Inline rename state
  let editingId = $state<string | null>(null)
  let editValue = $state('')
  let menuOpenId = $state<string | null>(null)

  const startRename = (id: string, currentName: string) => {
    editingId = id
    editValue = currentName
  }

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    editingId = null
    editValue = ''
  }

  const cancelRename = () => {
    editingId = null
    editValue = ''
  }
</script>

<div
  class="w-[200px] shrink-0 flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] relative"
  in:fly={{ x: -200, duration: 200 }}
>
  <!-- Connections header -->
  <div class="flex items-center justify-between px-4 pt-2 pb-1.5">
    <span class="text-[10px] tracking-wider uppercase opacity-60">{$i18n.t('sidebar.connections')}</span>
    <button
      class="opacity-25 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] leading-none"
      onclick={() => {
        onDisconnect()
        onAddView()
      }}
      title={$i18n.t('sidebar.addConnection')}
    >
      <svg
        class="w-[14px] h-[14px]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  </div>

  <!-- Connection list -->
  <div class="flex-1 min-h-0 overflow-y-auto px-2">
    <!-- Pinned: Open WebUI (local) -->
    {#if localConn && localInstalled}
      {@const isLocalDisabled = !serverReachable}
      <div
        class="w-full px-2 py-[6px] rounded-xl group flex items-center gap-2 transition-colors {isLocalDisabled
          ? 'opacity-40 cursor-default'
          : 'cursor-pointer'} {activeConnectionId === localConn.id
          ? 'bg-black/[0.06] dark:bg-white/[0.08]'
          : isLocalDisabled
            ? ''
            : 'hover:bg-black/[0.03] dark:bg-white/[0.05]'}"
        role="button"
        tabindex="0"
        onclick={() => !isLocalDisabled && onConnect(localConn.id)}
        onkeydown={(e) => e.key === 'Enter' && !isLocalDisabled && onConnect(localConn.id)}
      >
        {#if serverStatus === 'starting' || (serverStatus === 'running' && !serverReachable)}
          <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
            <div
              class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"
            ></div>
          </div>
        {:else if serverReachable}
          <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
            <div
              class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
            ></div>
          </div>
        {:else}
          <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-black/10 dark:bg-white/15"></div>
          </div>
        {/if}
        {#if editingId === localConn.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            class="text-[12px] bg-transparent text-[#1d1d1f] dark:text-[#fafafa] px-0 py-0 border-none outline-none rounded-md flex-1 min-w-0"
            bind:value={editValue}
            autofocus
            onfocus={(e) => e.currentTarget.select()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            onblur={commitRename}
          />
        {:else}
          <span
            class="text-[12px] {activeConnectionId === localConn.id
              ? 'opacity-90'
              : 'opacity-100'} transition-opacity truncate flex-1 min-w-0"
            >{localConn.name ?? 'Open WebUI'}</span
          >
        {/if}

        <div class="ml-auto relative shrink-0">
          <button
            class="opacity-20 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 leading-none"
            onclick={(e) => {
              e.stopPropagation()
              menuOpenId = menuOpenId === 'local' ? null : 'local'
            }}
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </button>

          {#if menuOpenId === 'local'}
            <div
              class="fixed inset-0 z-40"
              onclick={(e) => {
                e.stopPropagation()
                menuOpenId = null
              }}
            ></div>
            <div
              class="absolute right-0 top-6 z-50 w-[160px] bg-white dark:bg-[#1a1a1a]/90 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-2xl py-0.5 overflow-hidden"
              in:fly={{ y: -4, duration: 150 }}
              out:fade={{ duration: 100 }}
            >
              <div class="py-1 px-1.5">
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/[0.04] dark:bg-white/[0.06] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
                  onclick={(e) => {
                    e.stopPropagation()
                    menuOpenId = null
                    startRename(localConn.id, localConn.name ?? 'Open WebUI')
                  }}
                >
                  <svg
                    class="w-[14px] h-[14px] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                    />
                  </svg>
                  {$i18n.t('common.rename')}
                </button>
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/[0.04] dark:bg-white/[0.06] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
                  onclick={(e) => {
                    e.stopPropagation()
                    menuOpenId = null
                    window.electronAPI?.openInBrowser?.(localConn.url)
                  }}
                >
                  <svg
                    class="w-[14px] h-[14px] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                  {$i18n.t('sidebar.openInBrowser')}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if localConn && localInstalled && remoteConnections.length > 0}
      <div class="my-1 mx-2 border-t border-black/[0.04] dark:border-white/[0.04]"></div>
    {/if}

    {#each remoteConnections as conn (conn.id)}
      <div
        class="w-full px-2 py-[6px] rounded-xl group flex items-center gap-2 transition-colors cursor-pointer {activeConnectionId ===
        conn.id
          ? 'bg-black/[0.06] dark:bg-white/[0.08]'
          : 'hover:bg-black/[0.03] dark:bg-white/[0.05]'}"
        role="button"
        tabindex="0"
        onclick={() => editingId !== conn.id && onConnect(conn.id)}
        onkeydown={(e) => e.key === 'Enter' && editingId !== conn.id && onConnect(conn.id)}
      >
        <svg
          class="w-[14px] h-[14px] shrink-0 opacity-30"
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

        {#if editingId === conn.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            class="text-[12px] bg-transparent text-[#1d1d1f] dark:text-[#fafafa] px-0 py-0 border-none outline-none rounded-md flex-1 min-w-0"
            bind:value={editValue}
            autofocus
            onfocus={(e) => e.currentTarget.select()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            onblur={commitRename}
          />
        {:else}
          <span
            class="text-[12px] {activeConnectionId === conn.id
              ? 'opacity-90'
              : 'opacity-100'} transition-opacity truncate flex-1 min-w-0">{conn.name}</span
          >
        {/if}

        <!-- Three-dots menu -->
        <div class="ml-auto relative shrink-0">
          <button
            class="opacity-20 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 leading-none"
            onclick={(e) => {
              e.stopPropagation()
              menuOpenId = menuOpenId === conn.id ? null : conn.id
            }}
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </button>

          {#if menuOpenId === conn.id}
            <div
              class="fixed inset-0 z-40"
              onclick={(e) => {
                e.stopPropagation()
                menuOpenId = null
              }}
            ></div>
            <div
              class="absolute right-0 top-6 z-50 w-[160px] bg-white dark:bg-[#1a1a1a]/90 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-2xl py-0.5 overflow-hidden"
              in:fly={{ y: -4, duration: 150 }}
              out:fade={{ duration: 100 }}
            >
              <div class="py-1 px-1.5">
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/[0.04] dark:bg-white/[0.06] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
                  onclick={(e) => {
                    e.stopPropagation()
                    menuOpenId = null
                    startRename(conn.id, conn.name)
                  }}
                >
                  <svg
                    class="w-[14px] h-[14px] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
                    />
                  </svg>
                  {$i18n.t('common.rename')}
                </button>
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/[0.04] dark:bg-white/[0.06] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
                  onclick={(e) => {
                    e.stopPropagation()
                    menuOpenId = null
                    window.electronAPI?.openInBrowser?.(conn.url)
                  }}
                >
                  <svg
                    class="w-[14px] h-[14px] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                  {$i18n.t('sidebar.openInBrowser')}
                </button>
              </div>
              <div class="mx-3 border-t border-black/[0.06] dark:border-white/[0.06]"></div>
              <div class="py-1 px-1.5">
                <button
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-red-500/10 transition bg-transparent border-none text-red-400 rounded-xl"
                  onclick={(e) => {
                    e.stopPropagation()
                    menuOpenId = null
                    onRemove(conn.id)
                  }}
                >
                  <svg
                    class="w-[14px] h-[14px] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                  {$i18n.t('common.delete')}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Open Terminal toggle -->
  <div class="px-2 pb-1">
    <div class="border-t border-black/[0.06] dark:border-white/[0.06] pt-2 pb-1">
      <span class="text-[10px] tracking-wider uppercase opacity-25 px-2">{$i18n.t('sidebar.services')}</span>
    </div>
    <button
      class="w-full flex items-center gap-2 px-2 py-[6px] rounded-xl text-[12px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] text-left group {openTerminalStatus ===
      'started'
        ? 'opacity-70 hover:opacity-90'
        : 'opacity-40 hover:opacity-70'} {openTerminalStatus === 'starting' ||
      openTerminalStatus === 'stopping'
        ? 'pointer-events-none'
        : ''}"
      onclick={() => {
        if (openTerminalStatus === 'started') {
          onToggleOtLogs()
        } else {
          onToggleOpenTerminal()
        }
      }}
      use:tooltip={openTerminalStatus === 'started'
        ? view === 'open-terminal-logs'
          ? $i18n.t('sidebar.tooltip.hideLogs')
          : $i18n.t('sidebar.tooltip.viewLogs')
        : openTerminalStatus === 'starting'
          ? $i18n.t('common.starting')
          : openTerminalStatus === 'failed'
            ? $i18n.t('sidebar.tooltip.clickToRetry')
            : $i18n.t('sidebar.tooltip.startTerminalServer')}
    >
      <!-- Status indicator -->
      <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
        {#if openTerminalStatus === 'starting' || openTerminalStatus === 'stopping'}
          <div
            class="w-2.5 h-2.5 rounded-full border-2 border-amber-400/60 border-t-transparent animate-spin"
          ></div>
        {:else if openTerminalStatus === 'started'}
          <div
            class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
          ></div>
        {:else if openTerminalStatus === 'failed'}
          <div class="w-2 h-2 rounded-full bg-red-400/70"></div>
        {:else}
          <svg
            class="w-[14px] h-[14px] opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        {/if}
      </div>
      <span class="truncate">{$i18n.t('sidebar.openTerminal')}</span>
      <!-- Stop button (when running) -->
      {#if openTerminalStatus === 'started'}
        <button
          class="ml-auto opacity-0 group-hover:opacity-40 hover:!opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 leading-none"
          onclick={(e) => {
            e.stopPropagation()
            onToggleOpenTerminal()
          }}
          use:tooltip={$i18n.t('sidebar.tooltip.stopOpenTerminal')}
        >
          <svg
            class="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"
            />
          </svg>
        </button>
      {/if}
    </button>

    <!-- llama.cpp service -->
    <button
      class="w-full flex items-center gap-2 px-2 py-[6px] rounded-xl text-[12px] transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] text-left group {llamaCppStatus === 'started'
        ? 'opacity-70 hover:opacity-90'
        : 'opacity-40 hover:opacity-70'} {llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up' || llamaCppStatus === 'stopping'
        ? 'pointer-events-none'
        : ''}"
      onclick={() => {
        if (llamaCppStatus === 'started') {
          onToggleLlamaCppLogs()
        } else {
          onToggleLlamaCpp()
        }
      }}
      use:tooltip={llamaCppStatus === 'started'
        ? view === 'llamacpp-logs'
          ? $i18n.t('sidebar.tooltip.hideLogs')
          : $i18n.t('sidebar.tooltip.viewLogs')
        : llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up'
          ? $i18n.t('common.starting')
          : llamaCppStatus === 'failed'
            ? $i18n.t('sidebar.tooltip.clickToRetry')
            : $i18n.t('sidebar.tooltip.startLlamaServer')}
    >
      <!-- Status indicator -->
      <div class="w-[14px] h-[14px] shrink-0 flex items-center justify-center">
        {#if llamaCppStatus === 'starting' || llamaCppStatus === 'setting-up' || llamaCppStatus === 'stopping'}
          <div class="w-2.5 h-2.5 rounded-full border-2 border-amber-400/60 border-t-transparent animate-spin"></div>
        {:else if llamaCppStatus === 'started'}
          <div class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"></div>
        {:else if llamaCppStatus === 'failed'}
          <div class="w-2 h-2 rounded-full bg-red-400/70"></div>
        {:else}
          <svg class="w-[14px] h-[14px] opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
          </svg>
        {/if}
      </div>
      <span class="truncate">{$i18n.t('sidebar.llamaCpp')}</span>
      <!-- Stop button (when running) -->
      {#if llamaCppStatus === 'started'}
        <button
          class="ml-auto opacity-0 group-hover:opacity-40 hover:!opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 leading-none"
          onclick={(e) => {
            e.stopPropagation()
            onToggleLlamaCpp()
          }}
          use:tooltip={$i18n.t('sidebar.tooltip.stopLlamaServer')}
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
          </svg>
        </button>
      {/if}
    </button>
  </div>

  <!-- Settings popover -->
  {#if settingsOpen}
    <div class="fixed inset-0 z-40" onclick={() => (settingsOpen = false)}></div>

    <div
      class="absolute bottom-12 left-2 right-2 z-50 bg-white dark:bg-[#1a1a1a]/90 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-lg py-0.5 overflow-hidden"
      in:fly={{ y: 8, duration: 150 }}
      out:fade={{ duration: 100 }}
    >
      <div class="px-3.5 py-2.5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="text-[11px] opacity-40">{$i18n.t('app.desktop')}</div>
        <div class="text-[10px] opacity-20 mt-0.5">{$appInfo?.version ?? ''}</div>
      </div>

      <div class="py-1 px-1.5">
        <button
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/4 dark:hover:bg-white/4 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
          onclick={() => {
            settingsOpen = false
            onOpenSettings()
          }}
        >
          <svg
            class="w-[14px] h-[14px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          {$i18n.t('sidebar.settings')}
        </button>

        <button
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] opacity-50 hover:opacity-90 hover:bg-black/4 dark:hover:bg-white/4 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
          onclick={openGithub}
        >
          <svg
            class="w-[14px] h-[14px] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
          {$i18n.t('sidebar.github')}
        </button>
      </div>
    </div>
  {/if}

  <!-- Settings button (bottom) -->
  <div class="px-2 pb-3">
    <button
      class="w-full flex items-center gap-2 px-2 py-[6px] rounded-xl text-[12px] opacity-80 hover:opacity-70 hover:bg-black/4 dark:hover:bg-white/4 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] text-left"
      onclick={() => (settingsOpen = !settingsOpen)}
    >
      <svg
        class="w-[14px] h-[14px] shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
        />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {$i18n.t('sidebar.settings')}
    </button>
  </div>
</div>
