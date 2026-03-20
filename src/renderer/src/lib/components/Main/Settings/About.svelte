<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appInfo } from '../../../stores'
  import i18n from '../../../i18n'
  import logoImage from '../../../assets/images/splash-dark.png'

  let openWebuiVersion = $state<string | null>(null)
  let openTerminalVersion = $state<string | null>(null)
  let llamaCppVersion = $state<string | null>(null)

  // Update state
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  let updateStatus = $state<UpdateStatus>('idle')
  let updateVersion = $state<string | null>(null)
  let downloadPercent = $state(0)
  let updateError = $state<string | null>(null)

  let cleanupDataListener: (() => void) | null = null

  // Changelog state
  let changelogOpen = $state(false)
  let changelogLoading = $state(false)
  let changelogEntries = $state<{ version: string; date: string; body: string }[]>([])

  // ── Easter Egg ────────────────────────────────────────
  let clickCount = $state(0)
  let clickTimer: ReturnType<typeof setTimeout> | null = null
  let easterEggActive = $state(false)
  let dismissTimer: ReturnType<typeof setTimeout> | null = null
  let showReveal = $state(false)
  let typewriterText = $state('')
  let showTypewriter = $state(false)
  let typewriterTimers: ReturnType<typeof setTimeout>[] = []


  const handleVersionClick = () => {
    clickCount++
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(() => { clickCount = 0 }, 800)

    if (clickCount >= 7) {
      clickCount = 0
      if (clickTimer) clearTimeout(clickTimer)
      activateEasterEgg()
    }
  }

  const activateEasterEgg = () => {
    easterEggActive = true
    showReveal = false
    showTypewriter = true
    typewriterText = ''

    // Go fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {})

    // Full Matrix intro sequence
    const username = $appInfo?.username ?? 'Neo'
    const lines = [
      `Wake up, ${username}...`,
      'The Matrix has you...',
      'Follow the white rabbit.',
      `Knock, knock, ${username}.`
    ]

    let lineIdx = 0
    const typeLine = () => {
      if (lineIdx >= lines.length) {
        // All lines done — show logo with knock sound
        showTypewriter = false
        typewriterTimers.push(setTimeout(() => {
          showReveal = true
        }, 800))
        return
      }
      const line = lines[lineIdx]
      let charIdx = 0
      typewriterText = ''
      showTypewriter = true

      const typeChar = () => {
        if (charIdx < line.length) {
          typewriterText = line.slice(0, charIdx + 1)
          charIdx++
          typewriterTimers.push(setTimeout(typeChar, 140 + Math.random() * 60))
        } else {
          // Hold, then clear and move to next line
          typewriterTimers.push(setTimeout(() => {
            typewriterText = ''
            showTypewriter = false
            lineIdx++
            typewriterTimers.push(setTimeout(typeLine, 600))
          }, 1800))
        }
      }
      typewriterTimers.push(setTimeout(typeChar, 400))
    }

    typewriterTimers.push(setTimeout(typeLine, 1200))

    // Auto-dismiss after 25 seconds
    dismissTimer = setTimeout(() => dismissEasterEgg(), 25000)
  }

  const dismissEasterEgg = () => {
    showReveal = false
    showTypewriter = false
    typewriterText = ''
    typewriterTimers.forEach(t => clearTimeout(t))
    typewriterTimers = []
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    // Exit fullscreen first, then remove overlay after transition
    if (document.fullscreenElement) {
      document.exitFullscreen?.().then(() => {
        easterEggActive = false
      }).catch(() => {
        easterEggActive = false
      })
    } else {
      easterEggActive = false
    }
  }


  onMount(async () => {
    openWebuiVersion = await window.electronAPI.getPackageVersion('open-webui')
    openTerminalVersion = await window.electronAPI.getPackageVersion('open-terminal')

    try {
      const info = await window.electronAPI.getLlamaCppInfo()
      llamaCppVersion = info?.version ?? null
    } catch {}

    // Listen for update events from main process
    cleanupDataListener = window.electronAPI.onData((data: any) => {
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

  onDestroy(() => {
    cleanupDataListener?.()
    if (dismissTimer) clearTimeout(dismissTimer)
    if (clickTimer) clearTimeout(clickTimer)
    typewriterTimers.forEach(t => clearTimeout(t))
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
  <button
    class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-default text-[#1d1d1f] dark:text-[#fafafa]"
    onclick={handleVersionClick}
  >
    <div class="text-[13px] opacity-70">{$i18n.t('settings.about.desktopVersion')}</div>
    <div class="text-[12px] opacity-30">{$appInfo?.version ?? $i18n.t('common.unknown')}</div>
  </button>

  {#if openWebuiVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('open-webui/open-webui', openWebuiVersion!)}
    >
      <div class="text-[13px] opacity-70">{$i18n.t('settings.about.openWebuiVersion')}</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{openWebuiVersion}</div>
    </button>
  {/if}

  {#if openTerminalVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('open-webui/open-terminal', openTerminalVersion!)}
    >
      <div class="text-[13px] opacity-70">{$i18n.t('settings.about.openTerminalVersion')}</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{openTerminalVersion}</div>
    </button>
  {/if}

  {#if llamaCppVersion}
    <button
      class="w-full py-4 flex items-center justify-between bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('ggml-org/llama.cpp', llamaCppVersion!, '')}
    >
      <div class="text-[13px] opacity-70">{$i18n.t('settings.about.llamaCppVersion')}</div>
      <div class="text-[12px] opacity-30 group-hover:opacity-50 transition">{llamaCppVersion}</div>
    </button>
  {/if}

  <div class="py-4 flex items-center justify-between">
    <div class="text-[13px] opacity-70">{$i18n.t('settings.about.platform')}</div>
    <div class="text-[12px] opacity-30">{$appInfo?.platform ?? $i18n.t('common.unknown')}</div>
  </div>

  <!-- Update section -->
  <div class="py-4">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[13px] opacity-70">{$i18n.t('settings.about.softwareUpdate')}</div>
        {#if updateStatus === 'up-to-date'}
          <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.about.upToDate')}</div>
        {:else if updateStatus === 'available' && updateVersion}
          <div class="text-[11px] opacity-40 mt-0.5">{$i18n.t('settings.about.versionAvailable', { version: updateVersion })}</div>
        {:else if updateStatus === 'downloading'}
          <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.about.downloadingPercent', { percent: downloadPercent })}</div>
        {:else if updateStatus === 'downloaded'}
          <div class="text-[11px] opacity-40 mt-0.5">{$i18n.t('settings.about.updateReady')}</div>
        {:else if updateStatus === 'error'}
          <div class="text-[11px] text-red-400/60 mt-0.5">{updateError}</div>
        {/if}
      </div>

      <div>
        {#if updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error'}
          <button
            class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
            onclick={handleCheck}
          >
            {$i18n.t('settings.about.checkForUpdates')}
          </button>
        {:else if updateStatus === 'checking'}
          <button
            class="text-[12px] opacity-30 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl pointer-events-none flex items-center gap-1.5"
            disabled
          >
            <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round" />
            </svg>
            {$i18n.t('settings.about.checking')}
          </button>
        {:else if updateStatus === 'available'}
          <button
            class="text-[12px] opacity-50 hover:opacity-80 px-3 py-1.5 bg-black/[0.06] dark:bg-white/[0.08] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
            onclick={handleDownload}
          >
            {$i18n.t('settings.about.downloadUpdate')}
          </button>
        {:else if updateStatus === 'downloading'}
          <div class="flex items-center gap-2">
            <div class="w-24 h-1.5 bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div
                class="h-full bg-black/[0.15] dark:bg-white/30 rounded-full transition-all duration-300"
                style="width: {downloadPercent}%"
              ></div>
            </div>
            <span class="text-[11px] opacity-30">{downloadPercent}%</span>
          </div>
        {:else if updateStatus === 'downloaded'}
          <button
            class="text-[12px] opacity-50 hover:opacity-80 px-3 py-1.5 bg-black/[0.06] dark:bg-white/[0.08] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
            onclick={handleInstall}
          >
            {$i18n.t('settings.about.restartToUpdate')}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Changelog section -->
  <div class="py-4">
    <button
      class="text-[12px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] flex items-center gap-1.5"
      onclick={toggleChangelog}
    >
      <svg
        class="w-3 h-3 transition-transform {changelogOpen ? 'rotate-90' : ''}"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
       {$i18n.t('settings.about.whatsNew')}
    </button>

    {#if changelogOpen}
      <div class="mt-3 max-h-64 overflow-y-auto pr-1">
        {#if changelogLoading}
          <div class="text-[11px] opacity-25">{$i18n.t('common.loading')}</div>
        {:else if changelogEntries.length === 0}
          <div class="text-[11px] opacity-25">{$i18n.t('settings.about.noChangelog')}</div>
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
      class="text-[12px] opacity-40 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
      onclick={openGithub}
    >
      {$i18n.t('settings.about.viewOnGithub')}
    </button>
  </div>
</div>

<div class="text-[10px] opacity-15 mt-4 leading-relaxed">{$i18n.t('settings.about.copyright')}<br />{$i18n.t('settings.about.createdBy')}</div>

<!-- Easter Egg: Matrix Rain Overlay -->
{#if easterEggActive}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="matrix-overlay" onclick={dismissEasterEgg}>

    {#if showTypewriter}
      <div class="matrix-typewriter">
        <span>{typewriterText}</span><span class="cursor">▌</span>
      </div>
    {/if}

    {#if showReveal}
      <div class="matrix-reveal">
        <img src={logoImage} alt="Open WebUI" class="matrix-logo-img" />
      </div>
    {/if}
  </div>
{/if}

<style>
  .matrix-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #000;
    cursor: pointer;
    animation: matrixFadeIn 1.5s ease-out;
  }




  .matrix-typewriter {
    position: absolute;
    top: 80px;
    left: 60px;
    pointer-events: none;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace;
    font-size: 15px;
    color: #15b800;
    letter-spacing: 1px;
  }

  .matrix-typewriter .cursor {
    animation: blink 0.8s step-end infinite;
    opacity: 0.8;
  }

  .matrix-reveal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: ghostReveal 3s ease-out both;
  }

  .matrix-logo-img {
    width: 100px;
    height: 100px;
    object-fit: contain;
    filter: drop-shadow(0 0 20px rgba(57, 200, 20, 0.3)) drop-shadow(0 0 40px rgba(57, 200, 20, 0.15))
           brightness(0.8) sepia(1) saturate(3) hue-rotate(70deg);
    animation: ghostPulse 4s ease-in-out infinite, glitch 8s ease-in-out infinite;
  }

  @keyframes matrixFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ghostReveal {
    0% {
      opacity: 0;
      transform: scale(0.95);
      filter: blur(8px);
    }
    60% {
      opacity: 0.6;
      filter: blur(2px);
    }
    100% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
  }

  @keyframes ghostPulse {
    0%, 100% {
      filter: drop-shadow(0 0 20px rgba(57, 200, 20, 0.3)) drop-shadow(0 0 40px rgba(57, 200, 20, 0.15))
             brightness(0.8) sepia(1) saturate(3) hue-rotate(70deg);
      opacity: 0.8;
    }
    50% {
      filter: drop-shadow(0 0 30px rgba(57, 200, 20, 0.5)) drop-shadow(0 0 60px rgba(57, 200, 20, 0.25))
             brightness(0.9) sepia(1) saturate(3) hue-rotate(70deg);
      opacity: 1;
    }
  }

  @keyframes glitch {
    0%, 94%, 100% {
      transform: translate(0);
    }
    95% {
      transform: translate(-2px, 1px);
    }
    96% {
      transform: translate(2px, -1px);
    }
    97% {
      transform: translate(0);
    }
  }

  @keyframes blink {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0; }
  }

  @keyframes typewriterFade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

</style>
