<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { ServiceInfo } from '../../../../../shared/terminal'
  import { config, serverInfo } from '../../stores'
  import i18n from '../../i18n'
  import Content from './Connections/Content.svelte'
  import TerminalDock from './Connections/TerminalDock.svelte'

  let { onOpenSettings }: { onOpenSettings: () => void } = $props()

  let serverUrl = $state('')
  let content: Content | undefined = $state()
  let terminalDock: TerminalDock | undefined = $state()
  let canRefresh = $state(false)
  let connecting = $state(false)
  let launchError = $state('')
  let localInstalled = $state(false)
  let installPhase = $state('idle')
  let installError = $state('')
  let installStatus = $state('')
  let toastVisible = $state(false)
  let toastTimeout: ReturnType<typeof setTimeout> | undefined
  const serverStatus = $derived($serverInfo?.status)

  let llamaCppStatus = $state<string | null>(null)
  let llamaCppInfo = $state<{
    url?: string
    pid?: number | null
    binaryPath?: string
    error?: string
  } | null>(null)
  let llamaCppSetupStatus = $state('')
  let ollamaInfo = $state<(ServiceInfo & { binaryPath: string | null }) | null>(null)
  let ollamaSetupStatus = $state('')

  const openWebUI = async (restart = false): Promise<boolean> => {
    if (connecting) return false
    connecting = true
    launchError = ''
    try {
      let result: { url?: string | null } | null
      if (restart) {
        serverUrl = ''
        result = (await window.electronAPI.restartServer())
          ? await window.electronAPI.getServerInfo()
          : null
      } else result = await window.electronAPI.openLocalWebUI()
      if (!result?.url) {
        const info = await window.electronAPI.getServerInfo()
        if (info.status === 'stopped' && !restart) return false
        throw new Error(info.error || $i18n.t('error.serverStartFailed'))
      }
      serverUrl = result.url
      return true
    } catch (error) {
      launchError = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      connecting = false
    }
  }

  const startInstall = async (options?: {
    installLlamaCpp?: boolean
    installOllama?: boolean
    installDir?: string
  }): Promise<void> => {
    if (installPhase === 'working') return
    installPhase = 'working'
    installError = ''
    installStatus = ''
    toastVisible = false
    try {
      if (options?.installDir) {
        const currentDir = await window.electronAPI.getInstallDir()
        if (options.installDir !== currentDir) {
          await window.electronAPI.setConfig({ installDir: options.installDir })
        }
      }
      const disk = await window.electronAPI.getDiskSpace()
      if (disk?.free >= 0 && disk.free < 5 * 1024 * 1024 * 1024) {
        const availableGB = (disk.free / (1024 * 1024 * 1024)).toFixed(1)
        throw new Error(
          $i18n.t('error.diskSpaceDetail', { available: availableGB })
        )
      }
      if (!(await window.electronAPI.getPythonStatus())) {
        if (!(await window.electronAPI.installPython()))
          throw new Error($i18n.t('error.pythonInstallFailed'))
      }
      if (!(await window.electronAPI.installPackage()))
        throw new Error($i18n.t('error.installFailedGeneric'))
      localInstalled = true
      if (options?.installLlamaCpp) await window.electronAPI.startLlamaCpp()
      if (options?.installOllama) await window.electronAPI.startOllama()
      installStatus = $i18n.t('main.install.startingServer')
      if (!(await openWebUI()) && launchError) throw new Error(launchError)
      installPhase = 'idle'
      installStatus = ''
    } catch (error) {
      installPhase = 'error'
      installError = error instanceof Error ? error.message : $i18n.t('error.somethingWentWrong')
      toastVisible = true
      clearTimeout(toastTimeout)
      toastTimeout = setTimeout(() => {
        toastVisible = false
      }, 5000)
    }
  }

  onMount(() => {
    const unsubscribe = window.electronAPI.onData((event) => {
      if (['server:open', 'server:ready'].includes(event.type) && event.data?.url)
        serverUrl = event.data.url
      if (event.type === 'server:info' && ['stopped', 'failed'].includes(event.data?.status))
        serverUrl = ''
      if (event.type === 'ollama:info') ollamaInfo = event.data
      if (event.type === 'status:ollama-setup') ollamaSetupStatus = event.data ?? ''
      if (event.type === 'llamacpp:info') {
        llamaCppInfo = event.data
        llamaCppStatus = event.data.status
      }
      if (event.type === 'status:llamacpp-setup') llamaCppSetupStatus = event.data ?? ''
      if (event.type === 'status:install') installStatus = event.data ?? ''
      if (event.type === 'packages:changed') {
        localInstalled = !!event.data?.['open-webui']
        if (!localInstalled) serverUrl = ''
      }
    })
    let disposed = false
    Promise.all([
      window.electronAPI.getPackageVersion('open-webui'),
      window.electronAPI.getConfig()
    ]).then(([version, cfg]) => {
      if (disposed) return
      localInstalled = version !== null
      config.set(cfg)
      if (localInstalled && $config?.localServer?.enabled !== false) void openWebUI()
    })
    window.electronAPI.getOllamaInfo().then((info) => { if (!disposed) ollamaInfo = info })
    window.electronAPI.getLlamaCppInfo().then((info) => {
      if (disposed) return
      llamaCppInfo = info
      llamaCppStatus = info?.status ?? null
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  })
  onDestroy(() => clearTimeout(toastTimeout))
</script>

<div
  class="h-full w-full flex flex-col bg-[#f5f5f7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]"
>
  <Content
    bind:this={content}
    bind:canRefresh
    {serverUrl}
    {connecting}
    {launchError}
    {localInstalled}
    {installPhase}
    {installError}
    {installStatus}
    {toastVisible}
    onStartInstall={startInstall}
    onOpenWebUI={() => openWebUI()}
    onOpenTerminal={() => terminalDock?.select('server')}
  />

  <TerminalDock
    bind:this={terminalDock}
    {onOpenSettings}
    onRefresh={() => content?.refresh()}
    canRefresh={canRefresh && !connecting}
    services={[
      ...(localInstalled || (serverStatus && serverStatus !== 'stopped')
        ? [
            {
              id: 'server' as const,
              label: $i18n.t('statusBar.server'),
              status: serverStatus,
              pid: $serverInfo?.pid,
              browserUrl: $serverInfo?.reachable ? $serverInfo.url : undefined,
              detail: $serverInfo?.error || (serverStatus === 'starting' ? installStatus : ''),
              onStart: async () => {
                if (!(await openWebUI()) && launchError) throw new Error(launchError)
              },
              runningAction: 'restart' as const,
              onRunningAction: async () => {
                if (!(await openWebUI(true)))
                  throw new Error(launchError || $i18n.t('error.serverRestartFailed'))
              }
            }
          ]
        : []),
      ...(llamaCppInfo?.binaryPath || (llamaCppStatus && llamaCppStatus !== 'stopped')
        ? [
            {
              id: 'llamacpp' as const,
              label: $i18n.t('sidebar.llamaCpp'),
              status: llamaCppStatus,
              pid: llamaCppInfo?.pid,
              detail:
                llamaCppInfo?.error || (llamaCppStatus === 'starting' ? llamaCppSetupStatus : ''),
              onStart: () => window.electronAPI.startLlamaCpp(),
              runningAction: 'stop' as const,
              onRunningAction: () => window.electronAPI.stopLlamaCpp()
            }
          ]
        : []),
      ...(ollamaInfo?.binaryPath || (ollamaInfo?.status && ollamaInfo.status !== 'stopped')
        ? [{
            id: 'ollama' as const,
            label: 'Ollama',
            status: ollamaInfo.status,
            pid: ollamaInfo.pid,
            detail: ollamaInfo.error || (ollamaInfo.status === 'starting' ? ollamaSetupStatus : ''),
            onStart: () => window.electronAPI.startOllama(),
            runningAction: 'stop' as const,
            onRunningAction: () => window.electronAPI.stopOllama()
          }]
        : [])
    ]}
  />
</div>
