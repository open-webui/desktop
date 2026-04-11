<script lang="ts">
  import { onMount } from 'svelte'
  import { connections, config } from '../../../stores'
  import i18n, { getLanguages, changeLanguage } from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  let launchAtLogin = $state(false)
  let runInBackground = $state(true)
  let resetting = $state(false)
  let theme = $state<string>('system')
  let advancedOpen = $state(false)
  let installDirPath = $state('')
  let defaultInstallDir = $state('')

  // Env vars editor state
  let envEntries = $state<{ key: string; value: string }[]>([])

  // Language state
  let languages = $state<{ code: string; title: string }[]>([])
  let selectedLanguage = $state('en-US')

  onMount(async () => {
    launchAtLogin = await window.electronAPI.getLaunchAtLogin()
    const cfg = await window.electronAPI.getConfig()
    runInBackground = cfg?.runInBackground ?? true
    const vars = cfg?.envVars ?? {}
    envEntries = Object.entries(vars).map(([key, value]) => ({ key, value: value as string }))
    theme = cfg?.theme ?? 'system'
    applyThemeClass(theme)

    // Load install dir
    defaultInstallDir = await window.electronAPI.getInstallDir()
    installDirPath = cfg?.installDir || defaultInstallDir

    // Load languages
    languages = await getLanguages()
    selectedLanguage = cfg?.language ?? localStorage.getItem('locale') ?? 'en-US'
  })

  const applyThemeClass = (t: string) => {
    let resolved = t
    if (t === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolved)
  }

  const applyTheme = async (newTheme: string) => {
    theme = newTheme
    applyThemeClass(newTheme)
    await window.electronAPI.setConfig({ theme: newTheme })
    config.set(await window.electronAPI.getConfig())

    // Push theme to all active Open WebUI webviews
    const container = document.querySelector('.content-webview-container')
    if (container) {
      container.querySelectorAll('webview').forEach((wv: any) => {
        try {
          wv.send('desktop:event', { type: 'theme:update', data: { theme: newTheme } })
        } catch (_) {
          // webview may not be ready yet
        }
      })
    }
  }

  const setDefault = async (id: string) => {
    await window.electronAPI.setDefaultConnection(id)
    config.set(await window.electronAPI.getConfig())
  }

  const saveEnvVars = async () => {
    const envVars: Record<string, string> = {}
    for (const entry of envEntries) {
      const k = entry.key.trim()
      if (k) envVars[k] = entry.value
    }
    await window.electronAPI.setConfig({ envVars })
    config.set(await window.electronAPI.getConfig())
  }

  const addEnvVar = () => {
    envEntries = [...envEntries, { key: '', value: '' }]
  }

  const removeEnvVar = (index: number) => {
    envEntries = envEntries.filter((_, i) => i !== index)
    saveEnvVars()
  }

  // Shortcut recorder
  let shortcutValue = $state('')
  let recording = $state(false)
  let shortcutInputEl = $state<HTMLButtonElement | null>(null)

  // Spotlight shortcut recorder
  let spotlightShortcutValue = $state('')
  let spotlightRecording = $state(false)
  let spotlightShortcutInputEl = $state<HTMLButtonElement | null>(null)

  // Voice input shortcut recorder
  let voiceInputShortcutValue = $state('')
  let voiceInputRecording = $state(false)
  let voiceInputShortcutInputEl = $state<HTMLButtonElement | null>(null)
  let voiceInputEnabled = $state(true)

  // Keep shortcut value in sync with config store
  $effect(() => {
    if ($config?.globalShortcut !== undefined) {
      shortcutValue = $config.globalShortcut ?? ''
    }
  })

  $effect(() => {
    if ($config?.spotlightShortcut !== undefined) {
      spotlightShortcutValue = $config.spotlightShortcut ?? ''
    }
  })

  $effect(() => {
    if ($config?.voiceInputShortcut !== undefined) {
      voiceInputShortcutValue = $config.voiceInputShortcut ?? ''
    }
    if ($config?.voiceInputEnabled !== undefined) {
      voiceInputEnabled = $config.voiceInputEnabled ?? true
    }
  })

  const keyToElectron = (e: KeyboardEvent): string | null => {
    const parts: string[] = []
    if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    // Ignore bare modifier presses
    const ignore = ['Control', 'Meta', 'Alt', 'Shift']
    if (ignore.includes(e.key)) return null

    // Use e.code to get the physical key (avoids macOS Alt producing unicode like √ for V)
    const codeMap: Record<string, string> = {
      Space: 'Space',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Enter: 'Return',
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/'
    }

    let key: string
    if (codeMap[e.code]) {
      key = codeMap[e.code]
    } else if (e.code.startsWith('Key')) {
      key = e.code.slice(3) // KeyA → A
    } else if (e.code.startsWith('Digit')) {
      key = e.code.slice(5) // Digit1 → 1
    } else if (e.code.startsWith('F') && /^F\d+$/.test(e.code)) {
      key = e.code // F1, F2, etc.
    } else {
      key = e.key.length === 1 ? e.key.toUpperCase() : e.key
    }

    parts.push(key)
    return parts.join('+')
  }

  const displayShortcut = (accel: string): string => {
    if (!accel) return ''
    const isMac = navigator.platform.includes('Mac')
    return accel
      .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  }

  const handleShortcutKeydown = async (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      recording = false
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      shortcutValue = ''
      recording = false
      await window.electronAPI.setConfig({ globalShortcut: '' })
      config.set(await window.electronAPI.getConfig())
      return
    }

    const accel = keyToElectron(e)
    if (accel) {
      shortcutValue = accel
      recording = false
      await window.electronAPI.setConfig({ globalShortcut: accel })
      config.set(await window.electronAPI.getConfig())
    }
  }

  const handleSpotlightShortcutKeydown = async (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      spotlightRecording = false
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      spotlightShortcutValue = ''
      spotlightRecording = false
      await window.electronAPI.setConfig({ spotlightShortcut: '' })
      config.set(await window.electronAPI.getConfig())
      return
    }

    const accel = keyToElectron(e)
    if (accel) {
      spotlightShortcutValue = accel
      spotlightRecording = false
      await window.electronAPI.setConfig({ spotlightShortcut: accel })
      config.set(await window.electronAPI.getConfig())
    }
  }

  const handleVoiceInputShortcutKeydown = async (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      voiceInputRecording = false
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      voiceInputShortcutValue = ''
      voiceInputRecording = false
      await window.electronAPI.setConfig({ voiceInputShortcut: '' })
      config.set(await window.electronAPI.getConfig())
      return
    }

    const accel = keyToElectron(e)
    if (accel) {
      voiceInputShortcutValue = accel
      voiceInputRecording = false
      await window.electronAPI.setConfig({ voiceInputShortcut: accel })
      config.set(await window.electronAPI.getConfig())
    }
  }
</script>

<div class="flex flex-col divide-y divide-white/[0.04]">
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.language')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.languageDesc')}</div>
    </div>
    <select
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
      onchange={async (e) => {
        const lang = (e.target as HTMLSelectElement).value
        selectedLanguage = lang
        localStorage.setItem('locale', lang)
        changeLanguage(lang)
        await window.electronAPI.setConfig({ language: lang })
        config.set(await window.electronAPI.getConfig())
      }}
    >
      {#each languages as lang}
        <option value={lang.code} selected={selectedLanguage === lang.code}>{lang.title}</option>
      {/each}
    </select>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.appearance')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.appearanceDesc')}</div>
    </div>
    <div class="grid grid-cols-3 items-center gap-0.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] p-1 text-[11px]">
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'system' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('system')}
      >
        {$i18n.t('common.auto')}
      </button>
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'light' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('light')}
        aria-label={$i18n.t('settings.general.light')}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      </button>
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'dark' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('dark')}
        aria-label={$i18n.t('settings.general.dark')}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      </button>
    </div>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.defaultConnection')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.defaultConnectionDesc')}</div>
    </div>
    <select
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
      onchange={(e) => setDefault((e.target as HTMLSelectElement).value)}
    >
      <option value="">{$i18n.t('common.none')}</option>
      {#each $connections as conn}
        <option value={conn.id} selected={$config?.defaultConnectionId === conn.id}
          >{conn.name}</option
        >
      {/each}
    </select>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.launchAtLogin')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.launchAtLoginDesc')}</div>
    </div>
    <Switch
      checked={launchAtLogin}
      label={$i18n.t('settings.general.toggleLaunchAtLogin')}
      onchange={async (value) => {
        launchAtLogin = value
        await window.electronAPI.setLaunchAtLogin(launchAtLogin)
      }}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.runInBackground')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.runInBackgroundDesc')}</div>
    </div>
    <Switch
      checked={runInBackground}
      label={$i18n.t('settings.general.toggleRunInBackground')}
      onchange={async (value) => {
        runInBackground = value
        await window.electronAPI.setConfig({ runInBackground })
        config.set(await window.electronAPI.getConfig())
      }}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.globalShortcut')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {#if recording}
          {$i18n.t('settings.general.globalShortcutRecording')}
        {:else}
          {$i18n.t('settings.general.globalShortcutDesc')}
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1.5">
      <button
        bind:this={shortcutInputEl}
        class="text-[12px] px-3 py-1.5 border-none outline-none rounded-xl transition min-w-[80px] text-center
          {recording
            ? 'bg-black/[0.08] dark:bg-white/[0.10] text-[#1d1d1f] dark:text-[#fafafa] opacity-80 animate-pulse'
            : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#fafafa] opacity-60 hover:opacity-80'}"
        onclick={() => {
          recording = true
          shortcutInputEl?.focus()
        }}
        onkeydown={(e) => {
          if (recording) handleShortcutKeydown(e)
        }}
        onblur={() => {
          recording = false
        }}
      >
        {#if recording}
          <span class="text-[11px]">{$i18n.t('settings.general.pressShortcut')}</span>
        {:else if shortcutValue}
          {displayShortcut(shortcutValue)}
        {:else}
          <span class="opacity-40">{$i18n.t('common.disabled')}</span>
        {/if}
      </button>
      {#if shortcutValue && !recording}
        <button
          class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 shrink-0"
          onclick={async () => {
            shortcutValue = ''
            await window.electronAPI.setConfig({ globalShortcut: '' })
            config.set(await window.electronAPI.getConfig())
          }}
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">{$i18n.t('settings.general.spotlightShortcut')}</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {#if spotlightRecording}
          {$i18n.t('settings.general.globalShortcutRecording')}
        {:else}
          {$i18n.t('settings.general.spotlightShortcutDesc')}
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1.5">
      <button
        bind:this={spotlightShortcutInputEl}
        class="text-[12px] px-3 py-1.5 border-none outline-none rounded-xl transition min-w-[80px] text-center
          {spotlightRecording
            ? 'bg-black/[0.08] dark:bg-white/[0.10] text-[#1d1d1f] dark:text-[#fafafa] opacity-80 animate-pulse'
            : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#fafafa] opacity-60 hover:opacity-80'}"
        onclick={() => {
          spotlightRecording = true
          spotlightShortcutInputEl?.focus()
        }}
        onkeydown={(e) => {
          if (spotlightRecording) handleSpotlightShortcutKeydown(e)
        }}
        onblur={() => {
          spotlightRecording = false
        }}
      >
        {#if spotlightRecording}
          <span class="text-[11px]">{$i18n.t('settings.general.pressShortcut')}</span>
        {:else if spotlightShortcutValue}
          {displayShortcut(spotlightShortcutValue)}
        {:else}
          <span class="opacity-40">{$i18n.t('common.disabled')}</span>
        {/if}
      </button>
      {#if spotlightShortcutValue && !spotlightRecording}
        <button
          class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 shrink-0"
          onclick={async () => {
            spotlightShortcutValue = ''
            await window.electronAPI.setConfig({ spotlightShortcut: '' })
            config.set(await window.electronAPI.getConfig())
          }}
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Voice Input</div>
      <div class="text-[11px] opacity-25 mt-0.5">Enable global push-to-talk voice transcription</div>
    </div>
    <Switch
      checked={voiceInputEnabled}
      label="Toggle voice input"
      onchange={async (value) => {
        voiceInputEnabled = value
        await window.electronAPI.setConfig({ voiceInputEnabled: value })
        config.set(await window.electronAPI.getConfig())
      }}
    />
  </div>

  {#if voiceInputEnabled}
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Voice Input Shortcut</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        {#if voiceInputRecording}
          Press a key combination…
        {:else}
          Toggle microphone recording from anywhere
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-1.5">
      <button
        bind:this={voiceInputShortcutInputEl}
        class="text-[12px] px-3 py-1.5 border-none outline-none rounded-xl transition min-w-[80px] text-center
          {voiceInputRecording
            ? 'bg-black/[0.08] dark:bg-white/[0.10] text-[#1d1d1f] dark:text-[#fafafa] opacity-80 animate-pulse'
            : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#fafafa] opacity-60 hover:opacity-80'}"
        onclick={() => {
          voiceInputRecording = true
          voiceInputShortcutInputEl?.focus()
        }}
        onkeydown={(e) => {
          if (voiceInputRecording) handleVoiceInputShortcutKeydown(e)
        }}
        onblur={() => {
          voiceInputRecording = false
        }}
      >
        {#if voiceInputRecording}
          <span class="text-[11px]">Press keys…</span>
        {:else if voiceInputShortcutValue}
          {displayShortcut(voiceInputShortcutValue)}
        {:else}
          <span class="opacity-40">Disabled</span>
        {/if}
      </button>
      {#if voiceInputShortcutValue && !voiceInputRecording}
        <button
          class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 shrink-0"
          onclick={async () => {
            voiceInputShortcutValue = ''
            await window.electronAPI.setConfig({ voiceInputShortcut: '' })
            config.set(await window.electronAPI.getConfig())
          }}
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
  {/if}

  <!-- Advanced (collapsed by default) -->
  <div class="py-4">
    <button
      class="flex items-center gap-1.5 bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 cursor-pointer"
      onclick={() => { advancedOpen = !advancedOpen }}
    >
      <svg
        class="w-3 h-3 opacity-30 transition-transform duration-200 {advancedOpen ? 'rotate-90' : ''}"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <span class="text-[13px] opacity-50">{$i18n.t('common.advanced')}</span>
    </button>

    {#if advancedOpen}
        <div class="flex flex-col divide-y divide-white/[0.04] mt-1">
        <!-- Install location -->
        <div class="py-4 flex items-center justify-between gap-4">
          <div class="shrink-0">
            <div class="text-[13px] opacity-70">{$i18n.t('settings.general.installLocation')}</div>
            <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.installLocationDesc')}</div>
            <div class="text-[10px] opacity-15 mt-0.5">{$i18n.t('settings.general.installLocationNote')}</div>
          </div>
          <div class="flex items-center gap-1.5 min-w-0 flex-1 max-w-[280px] justify-end">
            <input
              type="text"
              class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60 min-w-0 flex-1 text-right font-mono"
              placeholder={defaultInstallDir || 'Default'}
              value={installDirPath === defaultInstallDir ? '' : installDirPath}
              onchange={async (e) => {
                const val = (e.target as HTMLInputElement).value.trim()
                installDirPath = val || defaultInstallDir
                await window.electronAPI.setConfig({ installDir: val })
                config.set(await window.electronAPI.getConfig())
              }}
            />
            <button
              class="shrink-0 text-[12px] opacity-40 hover:opacity-70 px-2.5 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl"
              onclick={async () => {
                const folder = await window.electronAPI.selectFolder()
                if (folder) {
                  installDirPath = folder
                  await window.electronAPI.setConfig({ installDir: folder })
                  config.set(await window.electronAPI.getConfig())
                }
              }}
            >
              {$i18n.t('common.browse')}
            </button>
          </div>
        </div>

        <!-- Environment variables -->
        <div class="py-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="text-[13px] opacity-70">{$i18n.t('settings.general.environmentVariables')}</div>
              <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.general.environmentVariablesDesc')}</div>
            </div>
            <button
              class="text-[11px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
              onclick={addEnvVar}
            >
              {$i18n.t('common.add')}
            </button>
          </div>

          {#if envEntries.length > 0}
            <div class="flex flex-col gap-2">
              {#each envEntries as entry, i}
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={$i18n.t('settings.general.keyPlaceholder')}
                    class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-2.5 py-1.5 border-none outline-none rounded-lg opacity-60 flex-1 min-w-0 font-mono"
                    value={entry.key}
                    oninput={(e) => { envEntries[i].key = (e.target as HTMLInputElement).value }}
                    onblur={saveEnvVars}
                  />
                  <span class="text-[11px] opacity-20">=</span>
                  <input
                    type="text"
                    placeholder="value"
                    class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-2.5 py-1.5 border-none outline-none rounded-lg opacity-60 flex-[2] min-w-0 font-mono"
                    value={entry.value}
                    oninput={(e) => { envEntries[i].value = (e.target as HTMLInputElement).value }}
                    onblur={saveEnvVars}
                  />
                  <button
                    class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0.5 shrink-0"
                    onclick={() => removeEnvVar(i)}
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-[11px] opacity-15">{$i18n.t('settings.general.noEnvVars')}</div>
          {/if}
        </div>

        <div class="py-4 flex items-center justify-between">
          <div>
            <div class="text-[13px] opacity-70">{$i18n.t('settings.general.factoryReset')}</div>
            <div class="text-[11px] opacity-25 mt-0.5">
              {$i18n.t('settings.general.factoryResetDesc')}
            </div>
          </div>
          <button
            class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {resetting ? 'pointer-events-none opacity-30' : ''}"
            disabled={resetting}
            onclick={async () => {
              if (
                confirm(
                  $i18n.t('settings.general.factoryResetConfirm')
                )
              ) {
                resetting = true
                await window.electronAPI.resetApp()
                window.location.reload()
              }
            }}
          >
            {#if resetting}
              <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-linecap="round" />
              </svg>
              {$i18n.t('common.resetting')}
            {:else}
              {$i18n.t('common.reset')}
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
