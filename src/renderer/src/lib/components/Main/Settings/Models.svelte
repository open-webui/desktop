<script lang="ts">
  import { onMount } from 'svelte'
  import i18n from '../../../i18n'

  interface HfModel {
    repo: string
    filename: string
    filepath: string
    size: number
    downloadedAt: string
  }

  interface HfRepoResult {
    id: string
    author: string
    modelId: string
    downloads: number
    likes: number
  }

  interface HfFileInfo {
    filename: string
    size: number
  }

  // State
  let models = $state<HfModel[]>([])
  let loaded = $state(false)
  let deleting = $state<string | null>(null)
  let searchError = $state('')
  let modelsDir = $state('')

  // Search state
  let searchQuery = $state('')
  let searchResults = $state<HfRepoResult[]>([])
  let searching = $state(false)
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  // Repo browser state
  let selectedRepo = $state<string | null>(null)
  let repoFiles = $state<HfFileInfo[]>([])
  let loadingFiles = $state(false)

  const MAX_CONCURRENT_DOWNLOADS = 3

  interface ActiveDownload {
    repo: string
    filename: string
    size: number
    percent: number
    status: 'queued' | 'downloading' | 'cancelling'
  }

  let activeDownloads = $state<Record<string, ActiveDownload>>({})
  let queuedDownloadKeys = $state<string[]>([])
  const activeDownloadList = $derived(Object.values(activeDownloads))
  const hasActiveDownloads = $derived(activeDownloadList.length > 0)

  const getDownloadKey = (repo: string, filename: string): string => `${repo}::${filename}`

  const removeLocalDownload = (key: string) => {
    const next = { ...activeDownloads }
    delete next[key]
    activeDownloads = next
    queuedDownloadKeys = queuedDownloadKeys.filter((k) => k !== key)
  }

  const startQueuedDownloads = () => {
    const runningCount = Object.values(activeDownloads).filter(
      (d) => d.status === 'downloading' || d.status === 'cancelling'
    ).length
    const availableSlots = Math.max(0, MAX_CONCURRENT_DOWNLOADS - runningCount)
    if (!availableSlots) return

    const toStart = queuedDownloadKeys.slice(0, availableSlots)
    for (const key of toStart) {
      const item = activeDownloads[key]
      if (!item) {
        queuedDownloadKeys = queuedDownloadKeys.filter((k) => k !== key)
        continue
      }

      activeDownloads = {
        ...activeDownloads,
        [key]: { ...item, status: 'downloading', percent: item.percent ?? 0 }
      }
      queuedDownloadKeys = queuedDownloadKeys.filter((k) => k !== key)

      void window.electronAPI
        .downloadHfModel(item.repo, item.filename, undefined, item.size)
        .catch((e: any) => {
          console.error('Failed to download model:', e)
        })
    }
  }

  onMount(() => {
    let cleanupDataListener: (() => void) | null = null

    const init = async () => {
      models = await window.electronAPI.listHfModels()
      modelsDir = (await window.electronAPI.getHfModelsDir()) || ''
      loaded = true

      cleanupDataListener = window.electronAPI.onData((data: any) => {
        if (data.type === 'status:huggingface-download') {
          const d = data.data
          if (d?.status === 'downloading') {
            const key = getDownloadKey(d.repo, d.filename)
            const existing = activeDownloads[key]
            activeDownloads = {
              ...activeDownloads,
              [key]: {
                repo: d.repo,
                filename: d.filename,
                size: existing?.size ?? d.totalBytes ?? 0,
                percent: d.percent ?? existing?.percent ?? 0,
                status: existing?.status === 'cancelling' ? 'cancelling' : 'downloading'
              }
            }
          }
          if (d?.status === 'done') {
            removeLocalDownload(getDownloadKey(d.repo, d.filename))
            window.electronAPI.listHfModels().then((m: HfModel[]) => {
              models = m
            })
            startQueuedDownloads()
          }
          if (d?.status === 'failed') {
            removeLocalDownload(getDownloadKey(d.repo, d.filename))
            startQueuedDownloads()
          }
        }
      })
    }

    void init()

    return () => {
      cleanupDataListener?.()
    }
  })

  const onSearchInput = (e: Event) => {
    const q = (e.target as HTMLInputElement).value
    searchQuery = q
    searchError = ''
    if (searchTimer) clearTimeout(searchTimer)

    if (!q.trim()) {
      searchResults = []
      searching = false
      return
    }

    searching = true
    searchTimer = setTimeout(async () => {
      try {
        searchResults = await window.electronAPI.searchHfModels(q.trim())
      } catch (e: any) {
        console.error('Search failed:', e)
        searchError = e?.message ?? 'Search failed'
        searchResults = []
      }
      searching = false
    }, 400)
  }

  const selectRepo = async (repoId: string) => {
    selectedRepo = repoId
    loadingFiles = true
    repoFiles = []
    try {
      repoFiles = await window.electronAPI.getHfRepoFiles(repoId)
    } catch (e) {
      console.error('Failed to load files:', e)
    }
    loadingFiles = false
  }

  const backToSearch = () => {
    selectedRepo = null
    repoFiles = []
  }

  const startDownload = (repo: string, filename: string, size?: number) => {
    const key = getDownloadKey(repo, filename)
    if (activeDownloads[key] || queuedDownloadKeys.includes(key)) return

    activeDownloads = {
      ...activeDownloads,
      [key]: {
        repo,
        filename,
        size: size ?? 0,
        percent: 0,
        status: 'queued'
      }
    }
    queuedDownloadKeys = [...queuedDownloadKeys, key]
    startQueuedDownloads()
  }

  const cancelDownload = async (repo: string, filename: string) => {
    const key = getDownloadKey(repo, filename)
    const active = activeDownloads[key]
    if (!active) return

    if (active.status === 'queued') {
      removeLocalDownload(key)
      return
    }

    activeDownloads = {
      ...activeDownloads,
      [key]: {
        ...active,
        status: 'cancelling'
      }
    }

    try {
      const cancelled = await window.electronAPI.cancelHfDownload(repo, filename)
      if (!cancelled) {
        const latest = activeDownloads[key]
        if (latest) {
          activeDownloads = {
            ...activeDownloads,
            [key]: {
              ...latest,
              status: 'downloading'
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to cancel download:', e)
      const latest = activeDownloads[key]
      if (latest) {
        activeDownloads = {
          ...activeDownloads,
          [key]: {
            ...latest,
            status: 'downloading'
          }
        }
      }
    }
  }

  const removeModel = async (repo: string, filename: string) => {
    deleting = `${repo}/${filename}`
    try {
      await window.electronAPI.deleteHfModel(repo, filename)
      models = await window.electronAPI.listHfModels()
    } catch (e) {
      console.error('Failed to delete model:', e)
    }
    deleting = null
  }

  const isDownloaded = (repo: string, filename: string): boolean => {
    return models.some((m) => m.repo === repo && m.filename === filename)
  }

  const isDownloading = (repo: string, filename: string): boolean => {
    const key = getDownloadKey(repo, filename)
    return activeDownloads[key]?.status === 'downloading'
  }

  const isQueued = (repo: string, filename: string): boolean => {
    const key = getDownloadKey(repo, filename)
    return activeDownloads[key]?.status === 'queued'
  }

  const isCancelling = (repo: string, filename: string): boolean => {
    const key = getDownloadKey(repo, filename)
    return activeDownloads[key]?.status === 'cancelling'
  }

  const formatSize = (bytes: number): string => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatDownloads = (n: number): string => {
    if (n < 1000) return `${n}`
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
    return `${(n / 1_000_000).toFixed(1)}M`
  }
</script>

{#if !loaded}
  <div class="py-6 text-[12px] opacity-20 text-center">{$i18n.t('common.loading')}</div>
{:else}
  <div class="flex flex-col divide-y divide-white/[0.04]">
    <!-- Models directory -->
    <div class="py-4 flex items-center justify-between gap-4">
      <div class="shrink-0">
        <div class="text-[13px] opacity-70">{$i18n.t('settings.models.modelsDirectory')}</div>
        <div class="text-[11px] opacity-25 mt-0.5">{$i18n.t('settings.models.modelsHint')}</div>
      </div>
      <button
        class="text-[12px] font-mono hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 underline decoration-dotted underline-offset-2 cursor-pointer flex items-center gap-1.5 min-w-0 truncate"
        onclick={() => {
          if (modelsDir) window.electronAPI.openPath(modelsDir)
        }}
      >
        <span class="truncate">{modelsDir || '…'}</span>
        <svg
          class="w-3 h-3 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      </button>
    </div>

    <!-- Downloaded models + active download -->
    <div class="py-4">
      <div class="text-[12px] opacity-50 mb-2">{$i18n.t('settings.models.downloadedModels')}</div>

      {#if models.length > 0 || hasActiveDownloads}
        <div class="flex flex-col gap-1.5">
          <!-- Active download in progress -->
          {#each activeDownloadList as activeDownload (getDownloadKey(activeDownload.repo, activeDownload.filename))}
            <div class="px-2.5 py-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-xl">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] opacity-60 font-mono flex items-center gap-2 min-w-0">
                    <span class="truncate min-w-0">{activeDownload.filename}</span>
                    {#if activeDownload.size > 0}
                      <span class="text-[10px] opacity-35 shrink-0"
                        >{formatSize(activeDownload.size)}</span
                      >
                    {/if}
                  </div>
                  <div class="text-[10px] opacity-25 truncate">
                    {activeDownload.repo} · {activeDownload.status === 'queued'
                      ? 'Queued'
                      : activeDownload.status === 'cancelling'
                        ? 'Cancelling'
                        : $i18n.t('common.downloading')}
                  </div>
                </div>
                <button
                  class="opacity-30 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-1 shrink-0"
                  onclick={() => cancelDownload(activeDownload.repo, activeDownload.filename)}
                  title={$i18n.t('settings.models.cancelDownload')}
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div
                class="w-full h-1 bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden"
              >
                <div
                  class="h-full bg-emerald-400/80 rounded-full"
                  style="width: {activeDownload.percent}%"
                ></div>
              </div>
              <div class="text-[10px] opacity-25 mt-1 text-right font-mono">
                {activeDownload.status === 'queued'
                  ? 'queued'
                  : activeDownload.status === 'cancelling'
                    ? 'cancelling'
                    : `${activeDownload.percent.toFixed(1)}%`}
              </div>
            </div>
          {/each}

          <!-- Completed downloads -->
          {#each models as model}
            <div
              class="flex items-center justify-between gap-2 px-2.5 py-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-xl"
            >
              <div class="min-w-0 flex-1">
                <div class="text-[12px] opacity-60 font-mono flex items-center gap-2 min-w-0">
                  <span class="truncate min-w-0">{model.filename}</span>
                </div>
                <div class="text-[10px] opacity-25 truncate">
                  {model.repo} · {formatSize(model.size)}
                </div>
              </div>
              <button
                class="opacity-20 hover:opacity-60 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-1 shrink-0 {deleting ===
                `${model.repo}/${model.filename}`
                  ? 'pointer-events-none'
                  : ''}"
                onclick={() => removeModel(model.repo, model.filename)}
                title={$i18n.t('settings.models.deleteModel')}
              >
                {#if deleting === `${model.repo}/${model.filename}`}
                  <div
                    class="w-3 h-3 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"
                  ></div>
                {:else}
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-[11px] opacity-40 py-3">{$i18n.t('settings.models.noModels')}</div>
      {/if}
    </div>

    <!-- Download from HF -->
    <div class="py-4">
      <div class="text-[12px] opacity-50 mb-2">
        {#if selectedRepo}
          <button
            class="opacity-50 hover:opacity-80 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-0 text-[12px] flex items-center gap-1"
            onclick={backToSearch}
          >
            {$i18n.t('common.back')}
          </button>
        {:else}
          {$i18n.t('settings.models.downloadFromHF')}
        {/if}
      </div>

      {#if selectedRepo}
        <!-- Repo file browser -->
        <div class="mb-2">
          <div class="text-[12px] opacity-60 font-mono truncate mb-2">{selectedRepo}</div>
        </div>

        {#if loadingFiles}
          <div class="flex items-center gap-2 py-3 justify-center">
            <div
              class="w-3 h-3 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"
            ></div>
            <span class="text-[11px] opacity-30">{$i18n.t('settings.models.loadingFiles')}</span>
          </div>
        {:else if repoFiles.length === 0}
          <div class="text-[11px] opacity-20 text-center py-3">
            {$i18n.t('settings.models.noGgufFiles')}
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each repoFiles as file}
              {@const downloaded = isDownloaded(selectedRepo, file.filename)}
              {@const dlActive = isDownloading(selectedRepo, file.filename)}
              {@const dlQueued = isQueued(selectedRepo, file.filename)}
              {@const dlCancelling = isCancelling(selectedRepo, file.filename)}
              {@const key = getDownloadKey(selectedRepo, file.filename)}
              <div
                class="flex items-center justify-between gap-2 px-2.5 py-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-xl"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] opacity-50 font-mono flex items-center gap-2 min-w-0">
                    <span class="truncate min-w-0">{file.filename}</span>
                    <span class="text-[10px] opacity-35 shrink-0">{formatSize(file.size)}</span>
                  </div>
                </div>
                {#if downloaded}
                  <span class="text-[10px] opacity-30 shrink-0 px-2"
                    >{$i18n.t('settings.models.downloaded')}</span
                  >
                {:else if dlActive}
                  <div class="flex items-center gap-1.5 shrink-0">
                    <div
                      class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"
                    ></div>
                    <span class="text-[10px] opacity-40 font-mono"
                      >{activeDownloads[key]?.percent?.toFixed(0) ?? 0}%</span
                    >
                  </div>
                {:else if dlQueued}
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] opacity-35 font-mono">queued</span>
                  </div>
                {:else if dlCancelling}
                  <div class="flex items-center gap-1.5 shrink-0">
                    <div
                      class="w-2.5 h-2.5 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin"
                    ></div>
                    <span class="text-[10px] opacity-35 font-mono">cancelling</span>
                  </div>
                {:else}
                  <button
                    class="opacity-30 hover:opacity-70 transition bg-transparent border-none text-[#1d1d1f] dark:text-[#fafafa] p-1 shrink-0"
                    onclick={() => startDownload(selectedRepo, file.filename, file.size)}
                    title={$i18n.t('common.download')}
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Search -->
        <div class="relative mb-2">
          <svg
            class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-25 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            class="bg-black/[0.04] dark:bg-white/[0.06] text-[12px] text-[#1d1d1f] dark:text-[#fafafa] pl-8 pr-3 py-2 border-none outline-none rounded-xl opacity-70 w-full"
            placeholder={$i18n.t('settings.models.searchPlaceholder')}
            value={searchQuery}
            oninput={onSearchInput}
          />
          {#if searching}
            <div
              class="w-3 h-3 rounded-full border-[1.5px] border-black/20 dark:border-white/30 border-t-transparent animate-spin absolute right-2.5 top-1/2 -translate-y-1/2"
            ></div>
          {/if}
        </div>

        {#if searchError}
          <div class="text-[11px] text-red-400/70 text-center py-2">{searchError}</div>
        {:else if searchResults.length > 0}
          <div class="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {#each searchResults as repo}
              <button
                class="flex items-center justify-between gap-2 px-2.5 py-2 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-xl transition border-none text-left w-full text-[#1d1d1f] dark:text-[#fafafa]"
                onclick={() => selectRepo(repo.id)}
              >
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] opacity-60 truncate">{repo.id}</div>
                  <div class="text-[10px] opacity-25 flex items-center gap-2 mt-0.5">
                    <span class="flex items-center gap-0.5">
                      <svg
                        class="w-2.5 h-2.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      {formatDownloads(repo.downloads)}
                    </span>
                    <span class="flex items-center gap-0.5">
                      <svg
                        class="w-2.5 h-2.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                        />
                      </svg>
                      {repo.likes}
                    </span>
                  </div>
                </div>
                <svg
                  class="w-3 h-3 opacity-20 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            {/each}
          </div>
        {:else if searchQuery.trim() && !searching}
          <div class="text-[11px] opacity-20 text-center py-3">
            {$i18n.t('settings.models.noReposFound')}
          </div>
        {:else if !searchQuery.trim()}
          <div class="text-[11px] opacity-20 text-center py-3">
            {$i18n.t('settings.models.searchForModels')}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
