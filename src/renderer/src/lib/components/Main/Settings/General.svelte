<script lang="ts">
  import { onMount } from 'svelte'
  import { connections, config } from '../../../stores'

  let launchAtLogin = $state(false)
  let resetting = $state(false)

  // Env vars editor state
  let envEntries = $state<{ key: string; value: string }[]>([])

  onMount(async () => {
    launchAtLogin = await window.electronAPI.getLaunchAtLogin()
    const cfg = await window.electronAPI.getConfig()
    const vars = cfg?.envVars ?? {}
    envEntries = Object.entries(vars).map(([key, value]) => ({ key, value: value as string }))
  })

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

  <!-- Environment variables -->
  <div class="py-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[13px] opacity-70">Environment variables</div>
        <div class="text-[11px] opacity-25 mt-0.5">Applied to all server processes</div>
      </div>
      <button
        class="text-[11px] opacity-30 hover:opacity-60 transition bg-transparent border-none text-[#fafafa]"
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
              class="bg-white/[0.06] text-[12px] text-[#fafafa] px-2.5 py-1.5 border-none outline-none rounded-lg opacity-60 flex-1 min-w-0 font-mono"
              value={entry.key}
              oninput={(e) => { envEntries[i].key = (e.target as HTMLInputElement).value }}
              onblur={saveEnvVars}
            />
            <span class="text-[11px] opacity-20">=</span>
            <input
              type="text"
              placeholder="value"
              class="bg-white/[0.06] text-[12px] text-[#fafafa] px-2.5 py-1.5 border-none outline-none rounded-lg opacity-60 flex-[2] min-w-0 font-mono"
              value={entry.value}
              oninput={(e) => { envEntries[i].value = (e.target as HTMLInputElement).value }}
              onblur={saveEnvVars}
            />
            <button
              class="opacity-20 hover:opacity-50 transition bg-transparent border-none text-[#fafafa] p-0.5 shrink-0"
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
      class="text-[12px] opacity-40 hover:opacity-70 px-3 py-1.5 bg-white/[0.06] transition border-none text-[#fafafa] rounded-xl flex items-center gap-1.5 {resetting ? 'pointer-events-none opacity-30' : ''}"
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
