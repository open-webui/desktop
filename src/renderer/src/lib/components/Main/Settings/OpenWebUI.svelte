<script lang="ts">
  import { onMount } from 'svelte'
  import { config, serverInfo } from '../../../stores'

  let serverStatus = $state<string | null>(null)
  let updating = $state(false)
  let stopping = $state(false)
  let starting = $state(false)
  let restarting = $state(false)
  let version = $state<string | null>(null)
  let loaded = $state(false)

  onMount(async () => {
    const info = await window.electronAPI.getServerInfo()
    serverStatus = info?.status ?? null
    version = await window.electronAPI.getPackageVersion('open-webui')
    loaded = true
  })

  const installed = $derived(version !== null)

  const isRunning = $derived(
    serverStatus === 'running' || $serverInfo?.reachable === true
  )

  let uninstalling = $state(false)
  let installing = $state(false)

  const updateConfig = async (key: string, value: any) => {
    const current = $config ?? {}
    const localServer = { ...(current.localServer ?? {}), [key]: value }
    await window.electronAPI.setConfig({ localServer })
    config.set(await window.electronAPI.getConfig())
  }

  const stopServer = async () => {
    stopping = true
    try {
      await window.electronAPI.stopServer()
      serverStatus = 'stopped'
    } catch (e) {
      console.error('Failed to stop server:', e)
    }
    stopping = false
  }

  const startServer = async () => {
    starting = true
    try {
      await window.electronAPI.startServer()
      serverStatus = 'running'
    } catch (e) {
      console.error('Failed to start server:', e)
    }
    starting = false
  }

  const restartServer = async () => {
    restarting = true
    try {
      await window.electronAPI.restartServer()
      serverStatus = 'running'
    } catch (e) {
      console.error('Failed to restart server:', e)
    }
    restarting = false
  }

  const updatePackage = async () => {
    updating = true
    try {
      if (isRunning) {
        await window.electronAPI.stopServer()
        serverStatus = 'stopped'
      }
      await window.electronAPI.installPackage()
      await window.electronAPI.startServer()
      serverStatus = 'running'
      version = await window.electronAPI.getPackageVersion('open-webui')
    } catch (e) {
      console.error('Failed to update:', e)
    }
    updating = false
  }
</script>

{#if !loaded}
  <div class="py-6 text-[12px] opacity-20 text-center">Loading…</div>
{:else if !installed}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-40">Not installed</div>
      <div class="text-[11px] opacity-20 mt-0.5">Set up a local Open WebUI server</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {installing ? 'pointer-events-none opacity-20' : ''}"
      disabled={installing}
      onclick={async () => {
        installing = true
        try {
          await window.electronAPI.installPackage()
          version = await window.electronAPI.getPackageVersion('open-webui')
        } catch (e) {
          console.error('Failed to install:', e)
        }
        installing = false
      }}
    >
      {#if installing}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
        Installing…
      {:else}
        Install
      {/if}
    </button>
  </div>
{:else}
<div class="flex flex-col divide-y divide-white/[0.04]">
  <!-- Server status & controls -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70">Server</div>
        <div class="text-[11px] opacity-25 mt-0.5">
          {#if version}v{version} ·{/if} Local Open WebUI instance
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        {#if isRunning}
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span class="text-[12px] opacity-50">Running</span>
        {:else if serverStatus === 'stopped'}
          <div class="w-1.5 h-1.5 rounded-full bg-white/20"></div>
          <span class="text-[12px] opacity-30">Stopped</span>
        {:else}
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400/60"></div>
          <span class="text-[12px] opacity-30 capitalize">{serverStatus ?? 'Unknown'}</span>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if isRunning}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {stopping ? 'pointer-events-none opacity-20' : ''}"
          disabled={stopping}
          onclick={stopServer}
        >
          {#if stopping}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
            Stopping…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
            </svg>
            Stop
          {/if}
        </button>
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {restarting ? 'pointer-events-none opacity-20' : ''}"
          disabled={restarting}
          onclick={restartServer}
        >
          {#if restarting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
            Restarting…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
            </svg>
            Restart
          {/if}
        </button>
      {:else}
        <button
          class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {starting ? 'pointer-events-none opacity-20' : ''}"
          disabled={starting}
          onclick={startServer}
        >
          {#if starting}
            <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
            Starting…
          {:else}
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
            Start
          {/if}
        </button>
      {/if}

      <button
        class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {updating ? 'pointer-events-none opacity-20' : ''}"
        disabled={updating}
        onclick={updatePackage}
      >
        {#if updating}
          <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
          Updating…
        {:else}
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M20.015 4.356v4.992m0 0h-4.992m4.993 0l-3.181-3.183a8.25 8.25 0 00-13.803 3.7" />
          </svg>
          Update
        {/if}
      </button>
    </div>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Start on launch</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        Automatically start server when app opens
      </div>
    </div>
    <button
      class="w-9 h-5 rounded-full transition-colors {$config?.localServer?.enabled !== false
        ? 'bg-white/30'
        : 'bg-white/[0.08]'} border-none relative"
      aria-label="Toggle start on launch"
      onclick={() => updateConfig('enabled', $config?.localServer?.enabled === false)}
    >
      <div
        class="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all {$config?.localServer?.enabled !== false
          ? 'left-[18px]'
          : 'left-[3px]'}"
      ></div>
    </button>
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
        Automatically update on launch
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

  <!-- Uninstall -->
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Uninstall</div>
      <div class="text-[11px] opacity-25 mt-0.5">Remove Open WebUI package</div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {uninstalling ? 'pointer-events-none opacity-20' : ''}"
      disabled={uninstalling}
      onclick={async () => {
        if (confirm('This will stop the server and remove the Open WebUI package. Continue?')) {
          uninstalling = true
          try {
            if (isRunning) await window.electronAPI.stopServer()
            await window.electronAPI.uninstallPackage('open-webui')
            version = null
          } catch (e) {
            console.error('Failed to uninstall:', e)
          }
          uninstalling = false
        }
      }}
    >
      {#if uninstalling}
        <div class="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/30 border-t-transparent animate-spin"></div>
        Uninstalling…
      {:else}
        Uninstall
      {/if}
    </button>
  </div>
</div>
{/if}
