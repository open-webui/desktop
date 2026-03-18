<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appInfo } from '../../../stores'

  let openWebuiVersion = $state<string | null>(null)
  let openTerminalVersion = $state<string | null>(null)

  // Update state
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  let updateStatus = $state<UpdateStatus>('idle')
  let updateVersion = $state<string | null>(null)
  let downloadPercent = $state(0)
  let updateError = $state<string | null>(null)

  let removeListener: (() => void) | null = null

  onMount(async () => {
    openWebuiVersion = await window.electronAPI.getPackageVersion('open-webui')
    openTerminalVersion = await window.electronAPI.getPackageVersion('open-terminal')

    // Listen for update events from main process
    const handler = (data: any) => {
      switch (data.type) {
        case 'update:checking':
          updateStatus = 'checking'
          updateError = null
          break
        case 'update:available':
          updateStatus = 'available'
          updateVersion = data.data?.version ?? null
          break
        case 'update:not-available':
          updateStatus = 'up-to-date'
          break
        case 'update:download-progress':
          updateStatus = 'downloading'
          downloadPercent = Math.round(data.data?.percent ?? 0)
          break
        case 'update:downloaded':
          updateStatus = 'downloaded'
          downloadPercent = 100
          break
        case 'update:error':
          updateStatus = 'error'
          updateError = data.data?.message ?? 'Unknown error'
          break
      }
    }

    window.electronAPI.onData(handler)
    removeListener = () => {
      // electron onData doesn't return an unsubscribe, so we just null out
    }
  })

  const openGithub = () => {
    window.electronAPI?.openInBrowser?.('https://github.com/open-webui/desktop')
  }

  const handleCheck = async () => {
    updateStatus = 'checking'
    updateError = null
    try {
      await window.electronAPI.checkForUpdates()
    } catch (e: any) {
      updateStatus = 'error'
      updateError = e?.message ?? 'Check failed'
    }
  }

  const handleDownload = async () => {
    updateStatus = 'downloading'
    downloadPercent = 0
    try {
      await window.electronAPI.downloadUpdate()
    } catch (e: any) {
      updateStatus = 'error'
      updateError = e?.message ?? 'Download failed'
    }
  }

  const handleInstall = () => {
    window.electronAPI.installUpdate()
  }
</script>

<div class="flex flex-col divide-y divide-white/[0.04]">
  <div class="py-4 flex items-center justify-between">
    <div class="text-[13px] opacity-70">Desktop Version</div>
    <div class="text-[12px] opacity-30">{$appInfo?.version ?? 'Unknown'}</div>
  </div>

  {#if openWebuiVersion}
    <div class="py-4 flex items-center justify-between">
      <div class="text-[13px] opacity-70">Open WebUI Version</div>
      <div class="text-[12px] opacity-30">{openWebuiVersion}</div>
    </div>
  {/if}

  {#if openTerminalVersion}
    <div class="py-4 flex items-center justify-between">
      <div class="text-[13px] opacity-70">Open Terminal Version</div>
      <div class="text-[12px] opacity-30">{openTerminalVersion}</div>
    </div>
  {/if}

  <div class="py-4 flex items-center justify-between">
    <div class="text-[13px] opacity-70">Platform</div>
    <div class="text-[12px] opacity-30">{$appInfo?.platform ?? 'Unknown'}</div>
  </div>

  <!-- Update section -->
  <div class="py-4">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[13px] opacity-70">Software Update</div>
        {#if updateStatus === 'up-to-date'}
          <div class="text-[11px] opacity-25 mt-0.5">You're on the latest version</div>
        {:else if updateStatus === 'available' && updateVersion}
          <div class="text-[11px] opacity-40 mt-0.5">Version {updateVersion} is available</div>
        {:else if updateStatus === 'downloading'}
          <div class="text-[11px] opacity-25 mt-0.5">Downloading… {downloadPercent}%</div>
        {:else if updateStatus === 'downloaded'}
          <div class="text-[11px] opacity-40 mt-0.5">Update ready — restart to apply</div>
        {:else if updateStatus === 'error'}
          <div class="text-[11px] text-red-400/60 mt-0.5">{updateError}</div>
        {/if}
      </div>

      <div>
        {#if updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error'}
          <button
            class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl"
            onclick={handleCheck}
          >
            Check for Updates
          </button>
        {:else if updateStatus === 'checking'}
          <button
            class="text-[12px] opacity-30 px-3 py-1.5 bg-white/[0.06] border-none text-[#fafafa] rounded-xl pointer-events-none flex items-center gap-1.5"
            disabled
          >
            <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round" />
            </svg>
            Checking…
          </button>
        {:else if updateStatus === 'available'}
          <button
            class="text-[12px] opacity-50 hover:opacity-80 px-3 py-1.5 bg-white/[0.08] transition border-none text-[#fafafa] rounded-xl"
            onclick={handleDownload}
          >
            Download Update
          </button>
        {:else if updateStatus === 'downloading'}
          <div class="flex items-center gap-2">
            <div class="w-24 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-white/30 rounded-full transition-all duration-300"
                style="width: {downloadPercent}%"
              ></div>
            </div>
            <span class="text-[11px] opacity-30">{downloadPercent}%</span>
          </div>
        {:else if updateStatus === 'downloaded'}
          <button
            class="text-[12px] opacity-50 hover:opacity-80 px-3 py-1.5 bg-white/[0.08] transition border-none text-[#fafafa] rounded-xl"
            onclick={handleInstall}
          >
            Restart to Update
          </button>
        {/if}
      </div>
    </div>
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

<div class="text-[10px] opacity-15 mt-4 leading-relaxed">Copyright (c) 2026 Open WebUI Inc. All rights reserved.<br />Created by Timothy J. Baek</div>
