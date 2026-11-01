<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { ServiceId } from '../../../../../../shared/terminal'
  import i18n from '../../../i18n'
  import { appInfo } from '../../../stores'
  import { tooltip } from '../../../actions/tooltip'
  import TerminalView from '../../common/TerminalView.svelte'
  import SettingsIcon from 'iconoir/icons/settings.svg?raw'
  import XmarkIcon from 'iconoir/icons/xmark.svg?raw'
  import PlayIcon from 'iconoir/icons/play.svg?raw'
  import NavArrowDownIcon from 'iconoir/icons/nav-arrow-down.svg?raw'
  import CheckIcon from 'iconoir/icons/check.svg?raw'
  import CopyIcon from 'iconoir/icons/copy.svg?raw'
  import RefreshIcon from 'iconoir/icons/refresh-double.svg?raw'
  import RestartIcon from 'iconoir/icons/system-restart.svg?raw'
  import ArrowUpRightIcon from 'iconoir/icons/arrow-up-right.svg?raw'

  interface Service {
    id: ServiceId
    label: string
    status?: string | null
    pid?: number | null
    detail?: string | null
    browserUrl?: string | null
    onStart: () => Promise<unknown>
    runningAction: 'stop' | 'restart'
    onRunningAction: () => Promise<unknown>
  }
  let { services, onOpenSettings, onRefresh, canRefresh }: {
    services: Service[]
    onOpenSettings: () => void
    onRefresh: () => void
    canRefresh: boolean
  } = $props()
  let activeId = $state<ServiceId>('server')
  let expanded = $state(false)
  let visited = $state<ServiceId[]>([])
  let panelHeight = $state(160)
  let terminalViews: Partial<Record<ServiceId, TerminalView>> = {}
  let pending = $state<Partial<Record<ServiceId, 'start' | 'stop' | 'restart'>>>({})
  let errors = $state<Partial<Record<ServiceId, string>>>({})
  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let endDrag: () => void = () => {}

  const active = $derived(services.find((service) => service.id === activeId) ?? services[0])
  function canStop(service: Service): boolean {
    return service.status === 'started' || service.status === 'starting' || !!service.pid
  }

  function isBusy(service: Service): boolean {
    return (
      pending[service.id] === 'stop' ||
      pending[service.id] === 'restart' ||
      (service.runningAction === 'restart' &&
        (service.status === 'starting' || pending[service.id] === 'start')) ||
      (pending[service.id] === 'start' && !canStop(service)) ||
      service.status === 'stopping' ||
      service.status === 'setting-up'
    )
  }
  function getStatusText(service: Service): string {
    return $i18n.t(
      service.status === 'started'
        ? 'common.running'
        : service.status === 'starting'
          ? 'common.starting'
          : service.status === 'setting-up'
            ? 'setup.settingUp'
            : service.status === 'stopping'
              ? 'common.stopping'
              : service.status === 'failed'
                ? 'common.failed'
                : 'common.stopped'
    )
  }
  const toggleLabel = $derived($i18n.t(expanded ? 'logs.collapse' : 'logs.expand'))
  const error = $derived(
    active && (errors[active?.id] || (active.status === 'failed' ? active.detail : ''))
  )

  export function select(id: ServiceId): void {
    activeId = id
    expanded = true
    if (!visited.includes(id)) visited = [...visited, id]
    copied = false
    clearTimeout(copyTimer)
  }

  function toggle(): void {
    if (expanded) expanded = false
    else if (active) select(active?.id)
  }

  function navigate(event: KeyboardEvent, index: number): void {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % services.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + services.length) % services.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = services.length - 1
    else return
    event.preventDefault()
    select(services[next].id)
    const button = event.currentTarget as HTMLButtonElement
    button
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus()
  }

  async function operate(service: Service): Promise<void> {
    if (isBusy(service)) return
    const action = canStop(service) ? service.runningAction : 'start'
    if (action === 'start') select(service.id)
    pending[service.id] = action
    errors[service.id] = ''
    try {
      await (action === 'start' ? service.onStart() : service.onRunningAction())
    } catch (cause) {
      // A stop can cancel a start that is still awaiting readiness.
      if (pending[service.id] === action) errors[service.id] = String(cause)
    } finally {
      if (pending[service.id] === action) delete pending[service.id]
    }
  }

  async function copyLogs(): Promise<void> {
    const id = active?.id
    if (!id) return
    const text = terminalViews[id]?.getBufferText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      if (active?.id !== id) return
      copied = true
      clearTimeout(copyTimer)
      copyTimer = setTimeout(() => {
        copied = false
      }, 1500)
    } catch {
      errors[id] = $i18n.t('logs.copyFailed')
    }
  }

  function resize(height: number): void {
    panelHeight = Math.max(108, Math.min(Math.max(108, window.innerHeight - 160), height))
  }

  function onDragStart(event: MouseEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    endDrag()
    const startY = event.clientY
    const startHeight = panelHeight
    // Keep the webview from swallowing drag events.
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ns-resize;'
    document.body.appendChild(overlay)
    const move = (event: MouseEvent): void => resize(startHeight + startY - event.clientY)
    endDrag = () => {
      overlay.remove()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('blur', endDrag)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('blur', endDrag)
  }

  onDestroy(() => {
    endDrag()
    clearTimeout(copyTimer)
  })
</script>

<section class="terminal-dock" aria-label={$i18n.t('logs.terminal')}>
  {#if active && expanded}
    <!-- Focusable separators support keyboard resizing as well as dragging. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="resize-edge"
      role="separator"
      aria-label={$i18n.t('logs.resize')}
      aria-orientation="horizontal"
      aria-valuenow={panelHeight}
      aria-valuemin={108}
      tabindex="0"
      onmousedown={onDragStart}
      onkeydown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          resize(panelHeight + (event.key === 'ArrowUp' ? 20 : -20))
        }
      }}
    ></div>
  {/if}
  <div class="terminal-bar">
    <button type="button" class="settings-button" onclick={onOpenSettings}
      ><span aria-hidden="true" class="inline-flex shrink-0 [&>svg]:size-full size-[12px]"
        >{@html SettingsIcon}</span
      >{$i18n.t('settings.title')}</button
    >
    <div class="terminal-tabs" role="tablist" aria-label={$i18n.t('logs.terminal')}>
      {#each services as service, index (service.id)}
        {@const statusText = getStatusText(service)}
        {@const actionLabel = `${$i18n.t(canStop(service) ? `common.${service.runningAction}` : 'common.start')} ${service.label}`}
        <div
          class="terminal-tab-group"
          class:selected={expanded && active?.id === service.id}
          role="presentation"
        >
          <button
            type="button"
            class="terminal-tab"
            role="tab"
            id={`terminal-tab-${service.id}`}
            aria-controls={`terminal-output-${service.id}`}
            aria-selected={expanded && active?.id === service.id}
            tabindex={active?.id === service.id ? 0 : -1}
            onclick={() => {
              if (expanded && active?.id === service.id) toggle()
              else select(service.id)
            }}
            onkeydown={(event) => navigate(event, index)}
          >
            {service.label}
            <span
              class="terminal-status ml-2 mr-0.5"
              data-status={service.status}
              role="status"
              use:tooltip={service.detail || statusText}
              ><span class="sr-only">{statusText}</span></span
            >
          </button>
          {#if !expanded && service.browserUrl}
            <button
              type="button"
              class="tab-control"
              aria-label={$i18n.t('setup.openInBrowser')}
              use:tooltip={$i18n.t('setup.openInBrowser')}
              onclick={() => window.electronAPI.openInBrowser(service.browserUrl)}
            >
              <span aria-hidden="true" class="inline-flex size-[10px] [&>svg]:size-full"
                >{@html ArrowUpRightIcon}</span
              >
            </button>
          {:else if !canStop(service) || (expanded && active?.id === service.id)}
            <button
              type="button"
              class="tab-control"
              aria-label={actionLabel}
              use:tooltip={actionLabel}
              disabled={isBusy(service)}
              onclick={() => operate(service)}
              >{#if canStop(service)}<span
                  aria-hidden="true"
                  class="inline-flex shrink-0 [&>svg]:size-full size-[10px]">{@html service.runningAction === 'restart' ? RestartIcon : XmarkIcon}</span
                >{:else}<span
                  aria-hidden="true"
                  class="inline-flex shrink-0 [&>svg]:size-full size-[10px]">{@html PlayIcon}</span
                >{/if}</button
            >
          {/if}
        </div>
      {/each}
    </div>
    {#if active}
      <button
        type="button"
        class="terminal-toggle"
        aria-label={toggleLabel}
        aria-expanded={expanded}
        onclick={toggle}
      ></button>
    {:else}
      <div class="terminal-spacer"></div>
    {/if}
    {#if $appInfo?.version}<span class="app-version drag-region">v{$appInfo.version}</span>{/if}
    <button
      type="button"
      class="terminal-refresh"
      aria-label={$i18n.t('common.refresh')}
      use:tooltip={$i18n.t('common.refresh')}
      disabled={!canRefresh}
      onclick={onRefresh}
    >
      <span aria-hidden="true" class="inline-flex size-[10px] [&>svg]:size-full">{@html RefreshIcon}</span>
    </button>
    {#if active}
      <button
        type="button"
        class="terminal-chevron-toggle"
        aria-label={toggleLabel}
        aria-expanded={expanded}
        use:tooltip={toggleLabel}
        onclick={toggle}
      >
        <span
          aria-hidden="true"
          class="inline-flex h-full w-[12px] items-center justify-center shrink-0 leading-none [&>svg]:size-[12px]"
          class:rotate-180={!expanded}>{@html NavArrowDownIcon}</span
        >
      </button>
    {/if}
  </div>
  <div
    class="terminal-body"
    style:height={`calc(${panelHeight}px - var(--terminal-bar-height))`}
    hidden={!active || !expanded}
  >
    {#if error}<div class="terminal-error" role="alert" title={error}>{error}</div>{/if}
    <div class="terminal-output">
      {#each services as service (service.id)}
        <div
          id={`terminal-output-${service.id}`}
          class="terminal-pane"
          role="tabpanel"
          aria-labelledby={`terminal-tab-${service.id}`}
          hidden={active?.id !== service.id}
        >
          {#if visited.includes(service.id)}
            <TerminalView
              bind:this={terminalViews[service.id]}
              service={service.id}
              readonly={service.id !== 'server'}
            />
          {/if}
        </div>
      {/each}
      <button
        type="button"
        class="terminal-action copy-output"
        aria-label={$i18n.t('logs.copyLogs')}
        use:tooltip={$i18n.t(copied ? 'logs.copied' : 'logs.copyLogs')}
        onclick={copyLogs}
      >
        {#if copied}<span
            aria-hidden="true"
            class="inline-flex shrink-0 [&>svg]:size-full size-[12px]">{@html CheckIcon}</span
          >{:else}<span
            aria-hidden="true"
            class="inline-flex shrink-0 [&>svg]:size-full size-[12px]">{@html CopyIcon}</span
          >{/if}
      </button>
    </div>
  </div>
</section>

<style>
  .terminal-dock {
    --terminal-bar-height: 24px;
    --terminal-background: #fff;
    --terminal-foreground: #37373a;
    --terminal-muted: #747478;
    --terminal-selection: #00000020;
    position: relative;
    flex-shrink: 0;
    background: var(--terminal-background);
    color: var(--terminal-muted);
    font-size: 11px;
  }
  :global(.dark) .terminal-dock {
    --terminal-background: #000;
    --terminal-foreground: #ceced0;
    --terminal-muted: #929296;
    --terminal-selection: #ffffff30;
  }
  .terminal-bar {
    --terminal-foreground: #000;
    --terminal-muted: #666;
    display: flex;
    align-items: center;
    height: var(--terminal-bar-height);
    min-width: 0;
    background: #fff;
    color: var(--terminal-muted);
  }
  :global(.dark) .terminal-bar {
    --terminal-foreground: #fff;
    --terminal-muted: #999;
    background: #000;
  }
  .terminal-tabs {
    display: flex;
    align-self: stretch;
    min-width: 0;
    flex: 0 1 auto;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .terminal-tabs::-webkit-scrollbar {
    display: none;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  button:hover:not(:disabled),
  .terminal-tab-group.selected {
    color: var(--terminal-foreground);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: -3px;
  }
  .terminal-tab {
    flex-shrink: 0;
    padding: 0 4px 0 8px;
    white-space: nowrap;
    height: 100%;
  }
  .terminal-tab-group {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .terminal-tab-group.selected .terminal-tab {
    font-weight: 500;
  }
  .tab-control {
    width: 20px;
    height: 100%;
    padding: 0 4px 0 0;
    color: var(--terminal-muted);
  }
  .terminal-toggle {
    flex: 1;
    min-width: 28px;
    height: 100%;
    padding: 0;
  }
  .app-version {
    padding: 0 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .terminal-chevron-toggle,
  .terminal-refresh {
    width: 18px;
    height: 100%;
    flex-shrink: 0;
    padding: 0;
  }
  .terminal-spacer {
    flex: 1;
  }
  .settings-button {
    height: 100%;
    gap: 5px;
    padding: 0 8px;
    flex-shrink: 0;
  }
  .terminal-action {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
  }
  .terminal-status {
    width: 5px;
    height: 5px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--terminal-muted);
  }
  .terminal-status[data-status='started'] {
    background: #22c55e;
  }
  .terminal-status[data-status='starting'],
  .terminal-status[data-status='setting-up'],
  .terminal-status[data-status='stopping'] {
    background: #d99a19;
  }
  .terminal-status[data-status='failed'] {
    background: #ef4444;
  }
  .terminal-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .terminal-body[hidden],
  .terminal-pane[hidden] {
    display: none;
  }
  .terminal-output {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .terminal-pane {
    position: absolute;
    inset: 0;
  }
  .copy-output {
    position: absolute;
    top: 2px;
    right: 14px;
  }
  .terminal-error {
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 8px;
    color: var(--terminal-foreground);
  }
  .resize-edge {
    position: absolute;
    top: -3px;
    inset-inline: 0;
    height: 6px;
    z-index: 1;
    cursor: ns-resize;
  }
  .resize-edge:focus-visible {
    outline: 1px solid var(--terminal-muted);
    outline-offset: -3px;
  }
  @media (pointer: coarse) {
    .terminal-dock {
      --terminal-bar-height: 44px;
    }
    .terminal-action {
      width: 44px;
      height: 44px;
    }
    .terminal-tab {
      min-height: 44px;
    }
  }
</style>
