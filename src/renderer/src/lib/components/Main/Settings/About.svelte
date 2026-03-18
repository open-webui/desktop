<script lang="ts">
  import { onMount } from 'svelte'
  import { appInfo } from '../../../stores'

  let openWebuiVersion = $state<string | null>(null)
  let openTerminalVersion = $state<string | null>(null)
  let llamaCppVersion = $state<string | null>(null)

  // Update state
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  let updateStatus = $state<UpdateStatus>('idle')
  let updateVersion = $state<string | null>(null)
  let downloadPercent = $state(0)
  let updateError = $state<string | null>(null)

  // Changelog state
  let changelogOpen = $state(false)
  let changelogLoading = $state(false)
  let changelogEntries = $state<{ version: string; date: string; body: string }[]>([])

  onMount(async () => {
    openWebuiVersion = await window.electronAPI.getPackageVersion('open-webui')
    openTerminalVersion = await window.electronAPI.getPackageVersion('open-terminal')

    try {
      const info = await window.electronAPI.getLlamaCppInfo()
      llamaCppVersion = info?.version ?? null
    } catch {}

    // Listen for update events from main process
    window.electronAPI.onData((data: any) => {
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
    })
  })

  const openRelease = (repo: string, version: string, prefix = 'v') => {
    window.electronAPI?.openInBrowser?.(`https://github.com/${repo}/releases/tag/${prefix}${version}`)
  }

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

  const toggleChangelog = async () => {
    changelogOpen = !changelogOpen
    if (changelogOpen && changelogEntries.length === 0) {
      changelogLoading = true
      try {
        const md = await window.electronAPI.getChangelog()
        if (md) parseChangelog(md)
      } finally {
        changelogLoading = false
      }
    }
  }

  const parseChangelog = (md: string) => {
    const entries: { version: string; date: string; body: string }[] = []
    const sections = md.split(/^## /m).slice(1)
    for (const section of sections) {
      const headerMatch = section.match(/^\[([^\]]+)\](?:\s*-\s*(.+))?/)
      if (!headerMatch) continue
      const version = headerMatch[1]
      const date = headerMatch[2]?.trim() ?? ''
      const body = section.slice(section.indexOf('\n') + 1).trim()
      if (version === 'Unreleased' && !body) continue
      entries.push({ version, date, body })
    }
    changelogEntries = entries
  }

  const renderMarkdown = (md: string): string => {
    return md
      .replace(/^### (.+)$/gm, '<div class="text-[11px] opacity-50 font-semibold mt-3 mb-1">$1</div>')
      .replace(/^- (.+)$/gm, '<div class="text-[11px] opacity-40 pl-2 leading-relaxed">• $1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="text-[10px] bg-white/[0.06] px-1 py-0.5 rounded">$1</code>')
  }
</script>

<div class="flex flex-col divide-y divide-white/[0.04]">
  <div class="py-4 flex items-center justify-between">
    <div class="text-[13px] opacity-70">Desktop Version</div>
    <div class="text-[12px] opacity-30">{$appInfo?.version ?? 'Unknown'}</div>
  </div>

  {#if openWebuiVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('open-webui/open-webui', openWebuiVersion!)}
    >
      <div class="text-[13px] opacity-70">Open WebUI Version</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{openWebuiVersion}</div>
    </button>
  {/if}

  {#if openTerminalVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('open-webui/open-terminal', openTerminalVersion!)}
    >
      <div class="text-[13px] opacity-70">Open Terminal Version</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{openTerminalVersion}</div>
    </button>
  {/if}

  {#if llamaCppVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('ggml-org/llama.cpp', llamaCppVersion!, '')}
    >
      <div class="text-[13px] opacity-70">llama.cpp Version</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{llamaCppVersion}</div>
    </button>
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

  <!-- Changelog section -->
  <div class="py-4">
    <button
      class="text-[12px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#fafafa] flex items-center gap-1.5"
      onclick={toggleChangelog}
    >
      <svg
        class="w-3 h-3 transition-transform {changelogOpen ? 'rotate-90' : ''}"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      What's New
    </button>

    {#if changelogOpen}
      <div class="mt-3 max-h-64 overflow-y-auto pr-1">
        {#if changelogLoading}
          <div class="text-[11px] opacity-25">Loading…</div>
        {:else if changelogEntries.length === 0}
          <div class="text-[11px] opacity-25">No changelog entries yet.</div>
        {:else}
          {#each changelogEntries as entry, i}
            {#if i > 0}
              <div class="border-t border-white/[0.04] my-3"></div>
            {/if}
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-[12px] opacity-60 font-medium">{entry.version}</span>
                {#if entry.date}
                  <span class="text-[10px] opacity-20">{entry.date}</span>
                {/if}
              </div>
              {#if entry.body}
                <div class="mt-1">
                  {@html renderMarkdown(entry.body)}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}
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
