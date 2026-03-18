<script lang="ts">
  import { onMount } from 'svelte'
  import { connections, config } from '../../../stores'
  import Switch from '../../common/Switch.svelte'

  let launchAtLogin = $state(false)
  let runInBackground = $state(true)
  let resetting = $state(false)
  let theme = $state<string>('system')

  // Env vars editor state
  let envEntries = $state<{ key: string; value: string }[]>([])

  onMount(async () => {
    launchAtLogin = await window.electronAPI.getLaunchAtLogin()
    const cfg = await window.electronAPI.getConfig()
    runInBackground = cfg?.runInBackground ?? true
    const vars = cfg?.envVars ?? {}
    envEntries = Object.entries(vars).map(([key, value]) => ({ key, value: value as string }))
    theme = cfg?.theme ?? 'system'
    applyThemeClass(theme)
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
</script>

<div class="flex flex-col divide-y divide-white/[0.04]">
  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Default connection</div>
      <div class="text-[11px] opacity-25 mt-0.5">Connection used on launch</div>
    </div>
    <select
      class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] px-3 py-1.5 border-none outline-none rounded-xl opacity-60"
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
      <div class="text-[13px] opacity-70">Launch at login</div>
      <div class="text-[11px] opacity-25 mt-0.5">Open app when you log in</div>
    </div>
    <Switch
      checked={launchAtLogin}
      label="Toggle launch at login"
      onchange={async (value) => {
        launchAtLogin = value
        await window.electronAPI.setLaunchAtLogin(launchAtLogin)
      }}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Run in background</div>
      <div class="text-[11px] opacity-25 mt-0.5">Keep running in the system tray when closed</div>
    </div>
    <Switch
      checked={runInBackground}
      label="Toggle run in background"
      onchange={async (value) => {
        runInBackground = value
        await window.electronAPI.setConfig({ runInBackground })
        config.set(await window.electronAPI.getConfig())
      }}
    />
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Appearance</div>
      <div class="text-[11px] opacity-25 mt-0.5">Choose light, dark, or system default</div>
    </div>
    <div class="grid grid-cols-3 items-center gap-0.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] p-1 text-[11px]">
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'system' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('system')}
      >
        Auto
      </button>
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'light' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('light')}
        aria-label="Light"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      </button>
      <button
        class="flex h-6 w-16 items-center justify-center rounded-xl border-none transition {theme === 'dark' ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#1d1d1f] dark:text-[#fafafa]' : 'bg-transparent text-[#1d1d1f] dark:text-[#fafafa] opacity-40 hover:opacity-70'}"
        onclick={() => applyTheme('dark')}
        aria-label="Dark"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Environment variables -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70">Environment variables</div>
        <div class="text-[11px] opacity-25 mt-0.5">Applied to all server processes</div>
      </div>
      <button
        class="text-[11px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa]"
        onclick={addEnvVar}
      >
        + Add
      </button>
    </div>

    {#if envEntries.length > 0}
      <div class="flex flex-col gap-2">
        {#each envEntries as entry, i}
          <div class="flex items-center gap-2">
            <input
              type="text"
              placeholder="KEY"
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
      <div class="text-[11px] opacity-15">No environment variables configured</div>
    {/if}
  </div>

  <div class="py-4 flex items-center justify-between">
    <div>
      <div class="text-[13px] opacity-70">Factory reset</div>
      <div class="text-[11px] opacity-25 mt-0.5">
        Remove Python, packages, data &amp; connections
      </div>
    </div>
    <button
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] transition border-none text-[#1d1d1f] dark:text-[#fafafa] rounded-xl flex items-center gap-1.5 {resetting ? 'pointer-events-none opacity-30' : ''}"
      disabled={resetting}
      onclick={async () => {
        if (
          confirm(
            'This will remove all installed components, data, and connections. The app will restart. Continue?'
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
        Resetting…
      {:else}
        Reset
      {/if}
    </button>
  </div>
</div>
