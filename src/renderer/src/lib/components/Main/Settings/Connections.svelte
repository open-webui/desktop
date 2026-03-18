<script lang="ts">
  import { connections, config } from '../../../stores'
  import i18n from '../../../i18n'

  const remove = async (id: string) => {
    await window.electronAPI.removeConnection(id)
    connections.set(await window.electronAPI.getConnections())
    config.set(await window.electronAPI.getConfig())
  }
</script>

<div class="flex flex-col divide-y divide-white/[0.04]">
  {#each $connections as conn}
    <div class="py-3 flex items-center justify-between">
      <div class="flex items-center gap-2.5 min-w-0">
        <svg
          class="w-[14px] h-[14px] shrink-0 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          {#if conn.type === 'local'}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
            />
          {:else}
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3"
            />
          {/if}
        </svg>
        <div class="min-w-0">
          <div class="text-[13px] opacity-70 truncate">{conn.name}</div>
          <div class="text-[11px] opacity-25 truncate mt-0.5">{conn.url}</div>
        </div>
      </div>
      <button
        class="text-[11px] opacity-30 hover:opacity-60 px-2 py-1 bg-transparent transition border-none text-[#1d1d1f] dark:text-[#fafafa] shrink-0"
        onclick={() => remove(conn.id)}
      >
        {$i18n.t('common.remove')}
      </button>
    </div>
  {/each}

  {#if ($connections ?? []).length === 0}
    <div class="py-6 text-[12px] opacity-20 text-center">{$i18n.t('settings.connections.noConnections')}</div>
  {/if}
</div>
