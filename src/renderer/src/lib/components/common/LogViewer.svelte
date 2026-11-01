<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Terminal, type ITheme } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'

  import type { ServiceId, TerminalOutput } from '../../../../../shared/terminal'

  interface Props {
    service: ServiceId
    readonly?: boolean
  }
  let { service, readonly = true }: Props = $props()
  let connectionId: number | undefined
  const resize = (): void => {
    if (!containerEl?.clientWidth || !containerEl?.clientHeight) return
    fitAddon?.fit()
    if (term && connectionId !== undefined)
      window.electronAPI.resizeTerminal(connectionId, term.cols, term.rows)
  }

  let containerEl: HTMLDivElement | undefined = $state()
  let term: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null
  let themeObserver: MutationObserver | null = null

  const terminalTheme = (): ITheme => {
    const style = getComputedStyle(containerEl!)
    return {
      background: style.backgroundColor,
      foreground: style.color,
      cursor: style.color,
      selectionBackground: style.getPropertyValue('--terminal-selection').trim()
    }
  }

  const initTerminal = (): void => {
    if (!containerEl || term) return

    term = new Terminal({
      cursorBlink: false,
      disableStdin: readonly,
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      lineHeight: 1,
      scrollback: 10000,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      theme: terminalTheme(),
      convertEol: true
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerEl)
    requestAnimationFrame(resize)

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(containerEl)
    themeObserver = new MutationObserver(() => {
      if (term && containerEl) term.options.theme = terminalTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    if (!readonly)
      term.onData((data: string) => {
        if (connectionId !== undefined) window.electronAPI.writeTerminal(connectionId, data)
      })
    connectionId = window.electronAPI.connectTerminal(
      service,
      (message: TerminalOutput, consumed: () => void) => {
        if (message.type === 'reset') {
          // Queue reset behind any output xterm is still parsing from the old run.
          term?.write('\x1bc', () => requestAnimationFrame(resize))
        } else if (term) term.write(message.data, consumed)
        else consumed()
      }
    )
  }

  const destroyTerminal = (): void => {
    resizeObserver?.disconnect()
    resizeObserver = null
    themeObserver?.disconnect()
    themeObserver = null
    if (connectionId !== undefined) window.electronAPI.disconnectTerminal(connectionId)
    connectionId = undefined
    term?.dispose()
    term = null
    fitAddon = null
  }

  export const getBufferText = (): string | null => {
    if (!term) return null
    const buf = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    }
    return lines.join('\n').trimEnd()
  }

  onMount(() => {
    initTerminal()
  })

  onDestroy(() => {
    destroyTerminal()
  })
</script>

<div class="terminal-viewer" bind:this={containerEl}></div>

<style>
  .terminal-viewer {
    position: absolute;
    inset: 0;
    background: var(--terminal-background);
    color: var(--terminal-foreground);
  }
  .terminal-viewer :global(.xterm) {
    padding: 4px 0 4px 8px;
  }
  .terminal-viewer :global(.xterm-viewport) {
    background: var(--terminal-background);
  }
</style>
