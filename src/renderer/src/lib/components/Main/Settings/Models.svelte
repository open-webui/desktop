<script lang="ts">
  import DownloadIcon from 'iconoir/icons/download.svg?raw'
  import HeartIcon from 'iconoir/icons/heart.svg?raw'
  import NavArrowLeftIcon from 'iconoir/icons/nav-arrow-left.svg?raw'
  import NavArrowRightIcon from 'iconoir/icons/nav-arrow-right.svg?raw'
  import OpenNewWindowIcon from 'iconoir/icons/open-new-window.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh.svg?raw'
  import SearchIcon from 'iconoir/icons/search.svg?raw'
  import TrashIcon from 'iconoir/icons/trash.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
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

  // Download state — track active downloads in the "Downloaded" section
  let activeDownloads = $state<Map<string, { repo: string; filename: string; percent: number }>>(new Map())

  const dlKey = (repo: string, filename: string): string => `${repo}/${filename}`

  onMount(async () => {
    models = await window.electronAPI.listHfModels()
    modelsDir = await window.electronAPI.getHfModelsDir() || ''
    loaded = true

    window.electronAPI.onData((data: any) => {
      if (data.type === 'status:huggingface-download') {
        const d = data.data
        const key = dlKey(d.repo, d.filename)
        if (d?.status === 'downloading') {
          const updated = new Map(activeDownloads)
          updated.set(key, { repo: d.repo, filename: d.filename, percent: d.percent ?? 0 })
          activeDownloads = updated
        }
        if (d?.status === 'done') {
          const updated = new Map(activeDownloads)
          updated.delete(key)
          activeDownloads = updated
          window.electronAPI.listHfModels().then((m: HfModel[]) => { models = m })
        }
        if (d?.status === 'failed') {
          const updated = new Map(activeDownloads)
          updated.delete(key)
          activeDownloads = updated
        }
      }
    })
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

  const startDownload = async (repo: string, filename: string, size?: number) => {
    const key = dlKey(repo, filename)
    const updated = new Map(activeDownloads)
    updated.set(key, { repo, filename, percent: 0 })
    activeDownloads = updated
    try {
      await window.electronAPI.downloadHfModel(repo, filename, undefined, size)
    } catch (e) {
      console.error('Failed to download model:', e)
      const cleaned = new Map(activeDownloads)
      cleaned.delete(key)
      activeDownloads = cleaned
    }
  }

  const cancelDownload = async (repo: string, filename: string) => {
    try {
      await window.electronAPI.cancelHfDownload(repo, filename)
    } catch (e) {
      console.error('Failed to cancel download:', e)
    }
    const updated = new Map(activeDownloads)
    updated.delete(dlKey(repo, filename))
    activeDownloads = updated
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
    return activeDownloads.has(dlKey(repo, filename))
  }

  const getDownloadPercent = (repo: string, filename: string): number => {
    return activeDownloads.get(dlKey(repo, filename))?.percent ?? 0
  }

  const hasActiveDownloads = $derived(activeDownloads.size > 0)

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
  <div class="py-6 text-[12px] text-center">{$i18n.t('common.loading')}</div>
{:else}
  <div class="flex flex-col gap-4">
    <!-- Models directory -->
    <div
      class="flex min-w-0 items-center justify-between gap-4 max-sm:flex-wrap [&>:first-child]:min-w-0 [&>:last-child]:shrink-0 sm:[&>:last-child]:max-w-[55%]"
    >
      <div class="min-w-0">
        <div class="text-[12px] text-gray-800 dark:text-gray-200">
          {$i18n.t('settings.models.modelsDirectory')}
        </div>
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 mt-0.5">
          {$i18n.t('settings.models.modelsHint')}
        </div>
      </div>
      <button
        class="text-[12px] font-mono transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-0 underline decoration-dotted underline-offset-2 cursor-pointer flex items-center gap-1.5 min-w-0 truncate"
        onclick={() => {
          if (modelsDir) window.electronAPI.openPath(modelsDir)
        }}
      >
        <span class="truncate">{modelsDir || '…'}</span>
        <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3 shrink-0"
          >{@html OpenNewWindowIcon}</span
        >
      </button>
    </div>

    <!-- Downloaded models + active downloads -->
    <div class="pt-1">
      <div class="text-[12px] mb-2">{$i18n.t('settings.models.downloadedModels')}</div>

      {#if models.length > 0 || hasActiveDownloads}
        <div class="flex flex-col">
          <!-- Active downloads -->
          {#each [...activeDownloads.values()] as dl (dlKey(dl.repo, dl.filename))}
            <div class="flex items-center gap-3 py-2 group">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-[12px] truncate font-mono">{dl.filename}</span>
                  <span class="text-[11px] text-gray-600 dark:text-gray-400 font-mono shrink-0"
                    >{dl.percent.toFixed(1)}%</span
                  >
                </div>
                <div
                  class="mt-1.5 w-full h-[3px] bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-emerald-400/70 rounded-full transition-[width] duration-300"
                    style="width: {dl.percent}%"
                  ></div>
                </div>
                <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-1 truncate">{dl.repo}</div>
              </div>
              <button
                class="opacity-60 hover:opacity-100 focus-visible:opacity-100 transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-1 shrink-0"
                onclick={() => cancelDownload(dl.repo, dl.filename)}
                title={$i18n.t('settings.models.cancelDownload')}
              >
                <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                  >{@html XmarkIcon}</span
                >
              </button>
            </div>
          {/each}

          <!-- Completed downloads -->
          {#each models as model}
            <div class="flex items-center gap-3 py-2 group">
              <div class="min-w-0 flex-1">
                <div class="text-[12px] truncate font-mono">{model.filename}</div>
                <div class="text-[11px] text-gray-600 dark:text-gray-400 truncate mt-0.5">
                  {model.repo} · {formatSize(model.size)}
                </div>
              </div>
              <button
                class="opacity-60 hover:opacity-100 focus-visible:opacity-100 transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-1 shrink-0 {deleting ===
                `${model.repo}/${model.filename}`
                  ? '!opacity-50 pointer-events-none'
                  : ''}"
                onclick={() => removeModel(model.repo, model.filename)}
                title={$i18n.t('settings.models.deleteModel')}
              >
                {#if deleting === `${model.repo}/${model.filename}`}
                  <span
                    aria-hidden="true"
                    class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
                    >{@html RefreshIcon}</span
                  >
                {:else}
                  <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                    >{@html TrashIcon}</span
                  >
                {/if}
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 py-3">
          {$i18n.t('settings.models.noModels')}
        </div>
      {/if}
    </div>

    <!-- Download from HF -->
    <div class="pt-1">
      <div class="text-[12px] mb-2">
        {#if selectedRepo}
          <button
            class="transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-0 text-[12px] flex items-center gap-1 font-mono truncate"
            onclick={backToSearch}
          >
            <span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3 shrink-0"
              >{@html NavArrowLeftIcon}</span
            >
            <span class="truncate">{selectedRepo}</span>
          </button>
        {:else}
          {$i18n.t('settings.models.downloadFromHF')}
        {/if}
      </div>

      {#if selectedRepo}
        <!-- Repo file browser -->
        {#if loadingFiles}
          <div class="flex items-center gap-2 py-3 justify-center">
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin"
              >{@html RefreshIcon}</span
            >
            <span class="text-[11px] leading-normal text-gray-600 dark:text-gray-400"
              >{$i18n.t('settings.models.loadingFiles')}</span
            >
          </div>
        {:else if repoFiles.length === 0}
          <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 text-center py-3">
            {$i18n.t('settings.models.noGgufFiles')}
          </div>
        {:else}
          <div class="flex flex-col">
            {#each repoFiles as file}
              {@const downloaded = isDownloaded(selectedRepo, file.filename)}
              {@const dlActive = isDownloading(selectedRepo, file.filename)}
              <div class="flex items-center gap-3 py-2 group">
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] truncate font-mono">{file.filename}</div>
                  <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{formatSize(file.size)}</div>
                  {#if dlActive}
                    <div
                      class="mt-1.5 w-full h-[3px] bg-black/[0.06] dark:bg-white/[0.06] rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-emerald-400/70 rounded-full transition-[width] duration-300"
                        style="width: {getDownloadPercent(selectedRepo, file.filename)}%"
                      ></div>
                    </div>
                  {/if}
                </div>
                {#if downloaded}
                  <span class="text-[11px] text-gray-600 dark:text-gray-400 shrink-0"
                    >{$i18n.t('settings.models.downloaded')}</span
                  >
                {:else if dlActive}
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[11px] text-gray-600 dark:text-gray-400 font-mono"
                      >{getDownloadPercent(selectedRepo, file.filename).toFixed(0)}%</span
                    >
                    <button
                      class="transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-0.5"
                      onclick={() => cancelDownload(selectedRepo, file.filename)}
                      title={$i18n.t('settings.models.cancelDownload')}
                    >
                      <span
                        aria-hidden="true"
                        class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3"
                        >{@html XmarkIcon}</span
                      >
                    </button>
                  </div>
                {:else}
                  <button
                    class="opacity-60 hover:opacity-100 focus-visible:opacity-100 transition bg-transparent border-none text-gray-900 dark:text-gray-100 p-1 shrink-0"
                    onclick={() => startDownload(selectedRepo, file.filename, file.size)}
                    title={$i18n.t('common.download')}
                  >
                    <span
                      aria-hidden="true"
                      class="inline-flex shrink-0 [&>svg]:size-full w-3.5 h-3.5"
                      >{@html DownloadIcon}</span
                    >
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Search -->
        <div class="relative mb-2">
          <span
            aria-hidden="true"
            class="inline-flex shrink-0 [&>svg]:size-full w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            >{@html SearchIcon}</span
          >
          <input
            type="text"
            class="placeholder:text-gray-600 dark:placeholder:text-gray-400 min-h-[28px] max-w-full rounded-lg border border-gray-100/50 bg-gray-50/40 px-2.5 py-1 text-[12px] leading-[18px] text-gray-900 outline-none transition-colors dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50 pl-[30px] pr-[30px] w-full"
            aria-label={$i18n.t('settings.models.searchPlaceholder')}
            placeholder={$i18n.t('settings.models.searchPlaceholder')}
            value={searchQuery}
            oninput={onSearchInput}
          />
          {#if searching}
            <span
              aria-hidden="true"
              class="inline-flex shrink-0 [&>svg]:size-full size-3 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2"
              >{@html RefreshIcon}</span
            >
          {/if}
        </div>

        {#if searchError}
          <div class="text-[11px] text-red-700 dark:text-red-400 text-center py-2">{searchError}</div>
        {:else if searchResults.length > 0}
          <div class="flex flex-col max-h-[300px] overflow-y-auto">
            {#each searchResults as repo}
              <button
                class="flex items-center justify-between gap-2 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded-lg transition border-none text-left w-full bg-transparent px-1"
                onclick={() => selectRepo(repo.id)}
              >
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] truncate">{repo.id}</div>
                  <div class="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                    <span class="flex items-center gap-0.5">
                      <span
                        aria-hidden="true"
                        class="inline-flex shrink-0 [&>svg]:size-full w-2.5 h-2.5"
                        >{@html DownloadIcon}</span
                      >
                      {formatDownloads(repo.downloads)}
                    </span>
                    <span class="flex items-center gap-0.5">
                      <span
                        aria-hidden="true"
                        class="inline-flex shrink-0 [&>svg]:size-full w-2.5 h-2.5"
                        >{@html HeartIcon}</span
                      >
                      {repo.likes}
                    </span>
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  class="inline-flex shrink-0 [&>svg]:size-full w-3 h-3 shrink-0"
                  >{@html NavArrowRightIcon}</span
                >
              </button>
            {/each}
          </div>
        {:else if searchQuery.trim() && !searching}
          <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 text-center py-3">
            {$i18n.t('settings.models.noReposFound')}
          </div>
        {:else if !searchQuery.trim()}
          <div class="text-[11px] leading-normal text-gray-600 dark:text-gray-400 text-center py-3">
            {$i18n.t('settings.models.searchForModels')}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
