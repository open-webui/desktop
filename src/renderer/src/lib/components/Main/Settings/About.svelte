<script lang="ts">
  import NavArrowRightIcon from 'iconoir/icons/nav-arrow-right.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import { onMount, onDestroy } from 'svelte'
  import { fade, scale } from 'svelte/transition'
  import { appInfo, config, desktopUpdate } from '../../../stores'
  import Switch from '../../common/Switch.svelte'
  import i18n from '../../../i18n'
  import logoImage from '../../../assets/images/splash-dark.png'

  let openWebuiVersion = $state<string | null>(null)
  let llamaCppVersion = $state<string | null>(null)

  const updateStatus = $derived($desktopUpdate.status)
  const updateVersion = $derived($desktopUpdate.version)
  const downloadPercent = $derived($desktopUpdate.percent ?? 0)
  const updateError = $derived($desktopUpdate.error)
  let savingAutomaticUpdates = $state(false)
  let settingsError = $state<string | null>(null)

  const saveAutomaticUpdates = async (enabled: boolean) => {
    savingAutomaticUpdates = true
    settingsError = null
    try {
      await window.electronAPI.setConfig({ automaticUpdates: enabled })
      config.set(await window.electronAPI.getConfig())
    } catch (error: any) {
      settingsError = error?.message ?? $i18n.t('error.unknown')
    } finally {
      savingAutomaticUpdates = false
    }
  }

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
      $i18n.t('settings.about.wakeUp', { username }),
      $i18n.t('settings.about.matrixHasYou'),
      $i18n.t('settings.about.followWhiteRabbit'),
      $i18n.t('settings.about.knockKnock', { username })
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

    try {
      const info = await window.electronAPI.getLlamaCppInfo()
      llamaCppVersion = info?.version ?? null
    } catch {}

  })

  onDestroy(() => {
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

  const runUpdateAction = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error: any) {
      desktopUpdate.update((state) => ({ ...state, status: 'error', error: error?.message ?? $i18n.t('error.unknown') }))
    }
  }

  const handleCheck = () => runUpdateAction(() => window.electronAPI.checkForUpdates())
  const handleDownload = () => runUpdateAction(() => window.electronAPI.downloadUpdate())
  const handleInstall = () => runUpdateAction(() => window.electronAPI.installUpdate())

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
      .replace(/^### (.+)$/gm, '<div class="text-[11px] font-semibold mt-3 mb-1">$1</div>')
      .replace(/^- (.+)$/gm, '<div class="text-[11px] pl-2 leading-relaxed">• $1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="text-[10px] bg-white/[0.06] px-1 py-0.5 rounded">$1</code>')
  }
</script>

<div class="flex flex-col">
  <button
    class="w-full flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%] bg-transparent border-none cursor-default text-gray-900 dark:text-gray-100"
    onclick={handleVersionClick}
  >
    <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
      {$i18n.t('settings.about.desktopVersion')}
    </div>
    <div class="text-[12px]">{$appInfo?.version ?? $i18n.t('common.unknown')}</div>
  </button>

  {#if openWebuiVersion}
    <button
      class="w-full flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%] bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('open-webui/open-webui', openWebuiVersion!)}
    >
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.about.openWebuiVersion')}
      </div>
      <div class="text-[12px] transition">{openWebuiVersion}</div>
    </button>
  {/if}

  {#if llamaCppVersion}
    <button
      class="w-full flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%] bg-transparent border-none cursor-pointer group"
      onclick={() => openRelease('ggml-org/llama.cpp', llamaCppVersion!, '')}
    >
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.about.llamaCppVersion')}
      </div>
      <div class="text-[12px] transition">{llamaCppVersion}</div>
    </button>
  {/if}

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
      {$i18n.t('settings.about.platform')}
    </div>
    <div class="text-[12px]">{$appInfo?.platform ?? $i18n.t('common.unknown')}</div>
  </div>

  <!-- Update section -->
  {#if updateStatus !== 'unsupported'}
    <div class="flex min-w-0 items-center justify-between gap-[16px] py-[7px]">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.about.automaticUpdates')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.about.automaticUpdatesDesc')}
        </div>
      </div>
      {#key `${$config?.automaticUpdates}-${savingAutomaticUpdates}`}
        <Switch
          checked={$config?.automaticUpdates === true}
          disabled={savingAutomaticUpdates}
          label={$i18n.t('settings.about.automaticUpdates')}
          onchange={saveAutomaticUpdates}
        />
      {/key}
    </div>
    {#if settingsError}<div role="alert" class="text-[11px] text-red-600 dark:text-red-400">{settingsError}</div>{/if}
  {/if}
  <div class="pt-1">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.about.softwareUpdate')}
        </div>
        {#if updateStatus === 'unsupported'}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {$i18n.t(`settings.about.updateUnsupported.${$desktopUpdate.reason ?? 'unsupported'}`)}
          </div>
        {:else if updateStatus === 'up-to-date'}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {$i18n.t('settings.about.upToDate')}
          </div>
        {:else if updateStatus === 'available' && updateVersion}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {$i18n.t('settings.about.versionAvailable', { version: updateVersion })}
          </div>
        {:else if updateStatus === 'downloading'}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {$i18n.t('settings.about.downloadingPercent', { percent: downloadPercent })}
          </div>
        {:else if updateStatus === 'downloaded'}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
            {$i18n.t('settings.about.updateReady')}
          </div>
        {:else if updateStatus === 'error'}
          <div class="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{updateError}</div>
        {/if}
      </div>

      <div class="shrink-0">
        {#if updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error'}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
            onclick={handleCheck}
          >
            {$i18n.t('settings.about.checkForUpdates')}
          </button>
        {:else if updateStatus === 'checking'}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] pointer-events-none"
            disabled
          >
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
              >{@html RefreshIcon}</span
            >
            {$i18n.t('settings.about.checking')}
          </button>
        {:else if updateStatus === 'available'}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
            onclick={handleDownload}
          >
            {$i18n.t('settings.about.downloadUpdate')}
          </button>
        {:else if updateStatus === 'downloading'}
          <div class="flex items-center gap-2">
            <div
              class="w-24 h-1.5 bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden"
            >
              <div
                class="h-full bg-black/[0.15] dark:bg-white/30 rounded-full transition-all duration-300"
                style="width: {downloadPercent}%"
              ></div>
            </div>
            <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">{downloadPercent}%</span>
          </div>
        {:else if updateStatus === 'downloaded'}
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
            onclick={handleInstall}
          >
            {$i18n.t('settings.about.restartToUpdate')}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Changelog section -->
  <div class="pt-1">
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
      aria-expanded={changelogOpen}
      onclick={toggleChangelog}
    >
      <span
        aria-hidden="true"
        class="inline-flex shrink-0 [&>svg]:size-full size-[12px] transition-transform {changelogOpen
          ? 'rotate-90'
          : ''}">{@html NavArrowRightIcon}</span
      >
      {$i18n.t('settings.about.whatsNew')}
    </button>

    {#if changelogOpen}
      <div class="mt-3 max-h-64 overflow-y-auto pr-1">
        {#if changelogLoading}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">{$i18n.t('common.loading')}</div>
        {:else if changelogEntries.length === 0}
          <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">
            {$i18n.t('settings.about.noChangelog')}
          </div>
        {:else}
          {#each changelogEntries as entry, i}
            {#if i > 0}
              <div class="my-[12px]"></div>
            {/if}
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-[12px] font-medium">{entry.version}</span>
                {#if entry.date}
                  <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">{entry.date}</span>
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

  <div class="pt-1">
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
      onclick={openGithub}
    >
      {$i18n.t('settings.about.viewOnGithub')}
    </button>
  </div>
</div>

<div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-4 leading-relaxed">
  {$i18n.t('settings.about.copyright')}<br />{$i18n.t('settings.about.createdBy')}
</div>

<!-- Easter Egg: Matrix Rain Overlay -->
{#if easterEggActive}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fixed inset-0 z-[9999] cursor-pointer bg-black" in:fade={{ duration: 1500 }} onclick={dismissEasterEgg}>
    {#if showTypewriter}
      <div class="pointer-events-none absolute left-[60px] top-[80px] font-mono text-[15px] tracking-[1px] text-[#15b800]">
        <span>{typewriterText}</span><span class="animate-pulse opacity-80 [animation-duration:800ms] motion-reduce:animate-none">▌</span>
      </div>
    {/if}

    {#if showReveal}
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" in:scale={{ duration: 3000, start: 0.95 }}>
        <img src={logoImage} alt="Open WebUI" class="size-[100px] animate-pulse object-contain brightness-[0.8] sepia saturate-[3] hue-rotate-[70deg] drop-shadow-[0_0_20px_rgba(57,200,20,0.3)] [animation-duration:4s] motion-reduce:animate-none" />
      </div>
    {/if}
  </div>
{/if}
