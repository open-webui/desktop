<script lang="ts">
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import NavArrowRightIcon from 'iconoir/icons/nav-arrow-right.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
  import { onMount } from 'svelte'
  import { appInfo, config } from '../../../stores'
  import i18n, { getLanguages, changeLanguage } from '../../../i18n'
  import Switch from '../../common/Switch.svelte'

  let launchAtLogin = $state(false)
  let startMinimized = $state(false)
  let showMenuBarIcon = $state(true)
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
    startMinimized = cfg?.startMinimized ?? false
    showMenuBarIcon = cfg?.showMenuBarIcon ?? true
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

  // Keep shortcut value in sync with config store
  $effect(() => {
    if ($config?.globalShortcut !== undefined) {
      shortcutValue = $config.globalShortcut ?? ''
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

</script>

<div class="flex flex-col">
  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.language')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.general.languageDesc')}
      </div>
    </div>
    <div class="relative inline-flex max-w-full [&>span]:right-[8px] [&>span]:size-[14px] [&>span]:text-[oklch(0.77_0_0)] dark:[&>span]:text-[oklch(0.69_0_0)]">
      <select
        class="w-full min-w-[100px] appearance-none text-ellipsis ps-[10px] pe-[32px] [field-sizing:content] h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield]"
        aria-label={$i18n.t('settings.general.language')}
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
      <span
        aria-hidden="true"
        class="inline-flex shrink-0 [&>svg]:size-full pointer-events-none absolute right-2 top-1/2 size-[14px] -translate-y-1/2 text-gray-600 dark:text-gray-400"
        >{@html NavArrowDownIcon}</span
      >
    </div>
  </div>

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.appearance')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.general.appearanceDesc')}
      </div>
    </div>
    <div class="relative inline-flex max-w-full [&>span]:right-[8px] [&>span]:size-[14px] [&>span]:text-[oklch(0.77_0_0)] dark:[&>span]:text-[oklch(0.69_0_0)]">
      <select
        class="w-full min-w-[100px] appearance-none text-ellipsis ps-[10px] pe-[32px] [field-sizing:content] h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield]"
        aria-label={$i18n.t('settings.general.appearance')}
        value={theme}
        onchange={(e) => applyTheme(e.currentTarget.value)}
      >
        <option value="system">{$i18n.t('common.auto')}</option>
        <option value="light">{$i18n.t('settings.general.light')}</option>
        <option value="dark">{$i18n.t('settings.general.dark')}</option>
      </select>
      <span
        aria-hidden="true"
        class="inline-flex shrink-0 [&>svg]:size-full pointer-events-none absolute right-2 top-1/2 size-[14px] -translate-y-1/2 text-gray-600 dark:text-gray-400"
        >{@html NavArrowDownIcon}</span
      >
    </div>
  </div>

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.launchAtLogin')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.general.launchAtLoginDesc')}
      </div>
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

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.startMinimized')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.general.startMinimizedDesc')}
      </div>
    </div>
    <Switch
      checked={startMinimized}
      label={$i18n.t('settings.general.toggleStartMinimized')}
      onchange={async (value) => {
        startMinimized = value
        await window.electronAPI.setConfig({ startMinimized })
        config.set(await window.electronAPI.getConfig())
      }}
    />
  </div>

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.runInBackground')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {$i18n.t('settings.general.runInBackgroundDesc')}
      </div>
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

  {#if $appInfo?.platform === 'darwin'}
    <div
      class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
    >
      <div>
        <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
          {$i18n.t('settings.general.showMenuBarIcon')}
        </div>
        <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
          {$i18n.t('settings.general.showMenuBarIconDesc')}
        </div>
      </div>
      <Switch
        checked={showMenuBarIcon}
        label={$i18n.t('settings.general.toggleShowMenuBarIcon')}
        onchange={async (value) => {
          showMenuBarIcon = value
          await window.electronAPI.setConfig({ showMenuBarIcon })
          config.set(await window.electronAPI.getConfig())
        }}
      />
    </div>
  {/if}

  <div
    class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
  >
    <div>
      <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
        {$i18n.t('settings.general.globalShortcut')}
      </div>
      <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
        {#if recording}
          {$i18n.t('settings.general.globalShortcutRecording')}
        {:else}
          {$i18n.t('settings.general.globalShortcutDesc')}
        {/if}
      </div>
    </div>
    <div class="flex items-center gap-[6px]">
      <button
        bind:this={shortcutInputEl}
        class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] min-w-[80px] text-center {recording
          ? 'animate-pulse'
          : ''}"
        aria-label={$i18n.t('settings.general.globalShortcut')}
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
          <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]"
            >{$i18n.t('settings.general.pressShortcut')}</span
          >
        {:else if shortcutValue}
          {displayShortcut(shortcutValue)}
        {:else}
          <span class="">{$i18n.t('common.disabled')}</span>
        {/if}
      </button>
      {#if shortcutValue && !recording}
        <button
          class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] size-[28px]"
          aria-label={$i18n.t('common.remove')}
          onclick={async () => {
            shortcutValue = ''
            await window.electronAPI.setConfig({ globalShortcut: '' })
            config.set(await window.electronAPI.getConfig())
          }}
        >
          <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
            >{@html XmarkIcon}</span
          >
        </button>
      {/if}
    </div>
  </div>

  <!-- Advanced (collapsed by default) -->
  <div class="pt-1">
    <button
      class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
      aria-expanded={advancedOpen}
      onclick={() => {
        advancedOpen = !advancedOpen
      }}
    >
      <span
        aria-hidden="true"
        class="inline-flex shrink-0 [&>svg]:size-full size-[12px] transition-transform duration-200 {advancedOpen
          ? 'rotate-90'
          : ''}">{@html NavArrowRightIcon}</span
      >
      <span class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">{$i18n.t('common.advanced')}</span>
    </button>

    {#if advancedOpen}
      <div class="mt-[16px] flex flex-col">
        <!-- Install location -->
        <div
          class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
        >
          <div class="min-w-0">
            <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
              {$i18n.t('settings.general.installLocation')}
            </div>
            <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
              {$i18n.t('settings.general.installLocationDesc')}
            </div>
            <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
              {$i18n.t('settings.general.installLocationNote')}
            </div>
          </div>
          <div class="flex min-w-[140px] flex-[0_1_280px] max-w-[280px] shrink! items-center justify-end gap-[6px]">
            <input
              type="text"
              aria-label={$i18n.t('settings.general.installLocation')}
              class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] min-w-0 flex-1"
              placeholder={defaultInstallDir || $i18n.t('common.default')}
              value={installDirPath === defaultInstallDir ? '' : installDirPath}
              onchange={async (e) => {
                const val = (e.target as HTMLInputElement).value.trim()
                installDirPath = val || defaultInstallDir
                await window.electronAPI.setConfig({ installDir: val })
                config.set(await window.electronAPI.getConfig())
              }}
            />
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
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
        <div class="pt-1">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
                {$i18n.t('settings.general.environmentVariables')}
              </div>
              <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
                {$i18n.t('settings.general.environmentVariablesDesc')}
              </div>
            </div>
            <button
              class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px]"
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
                    class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] flex-1 min-w-0"
                    value={entry.key}
                    oninput={(e) => {
                      envEntries[i].key = (e.target as HTMLInputElement).value
                    }}
                    onblur={saveEnvVars}
                  />
                  <span class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">=</span>
                  <input
                    type="text"
                    placeholder={$i18n.t('settings.general.valuePlaceholder')}
                    class="h-[28px] min-h-[28px] max-w-full rounded-[8px] border border-[oklch(0.94_0_0/0.5)] outline-hidden! bg-[oklch(0.98_0_0/0.4)] px-[8px] py-0 text-[12px] leading-[16px] font-normal text-[oklch(0.42_0_0)] transition-colors duration-150 placeholder:text-[oklch(0.85_0_0)] focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-[oklch(0.85_0_0)] dark:placeholder:text-[oklch(0.42_0_0)] dark:focus:border-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] flex-[2] min-w-0"
                    value={entry.value}
                    oninput={(e) => {
                      envEntries[i].value = (e.target as HTMLInputElement).value
                    }}
                    onblur={saveEnvVars}
                  />
                  <button
                    class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] p-[2px]"
                    aria-label={$i18n.t('common.remove')}
                    onclick={() => removeEnvVar(i)}
                  >
                    <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
                      >{@html XmarkIcon}</span
                    >
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)]">
              {$i18n.t('settings.general.noEnvVars')}
            </div>
          {/if}
        </div>

        <div
          class="flex min-w-0 items-center justify-between gap-[16px] py-[7px] max-sm:gap-[12px] [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 max-sm:[&>:last-child:not([role=switch])]:max-w-[65%]"
        >
          <div>
            <div class="text-[12px] leading-[16px] font-normal text-[#171717] dark:text-white">
              {$i18n.t('settings.general.factoryReset')}
            </div>
            <div class="text-[11px] leading-[16px] text-[oklch(0.51_0_0)] dark:text-[oklch(0.77_0_0)] mt-0.5">
              {$i18n.t('settings.general.factoryResetDesc')}
            </div>
          </div>
          <button
            class="inline-flex max-w-full shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border-none bg-transparent p-0 text-[12px] leading-[16px] text-[oklch(0.69_0_0)] transition-colors duration-150 hover:text-[oklch(0.2_0_0)] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-white [&>span[aria-hidden]]:size-[12px] {resetting
              ? 'pointer-events-none opacity-50'
              : ''}"
            disabled={resetting}
            onclick={async () => {
              if (confirm($i18n.t('settings.general.factoryResetConfirm'))) {
                resetting = true
                await window.electronAPI.resetApp()
                window.location.reload()
              }
            }}
          >
            {#if resetting}
              <span
                aria-hidden="true"
                class="inline-flex shrink-0 [&>svg]:size-full size-[12px] animate-spin"
                >{@html RefreshIcon}</span
              >
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
