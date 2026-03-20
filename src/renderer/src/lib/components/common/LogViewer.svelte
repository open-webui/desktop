<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'

  interface Props {
    connect: (callback: (data: string) => void) => void
    disconnect: () => void
    readonly?: boolean
    onWrite?: (data: string) => void
    onResize?: (cols: number, rows: number) => void
  }

  let {
    connect,
    disconnect,
    readonly = false,
    onWrite,
    onResize
  }: Props = $props()

  let containerEl: HTMLDivElement | undefined = $state()
  let term: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null

  const initTerminal = () => {
    if (!containerEl || term) return

    term = new Terminal({
      cursorBlink: false,
      disableStdin: readonly,
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      lineHeight: 1.5,
      scrollback: 10000,
      theme: {
        background: '#0a0a0a',
        foreground: '#a0a0a0',
        cursor: readonly ? '#d4d4d4' : 'transparent',
        selectionBackground: readonly ? '#264f78' : '#ffffff30'
      },
      convertEol: true
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerEl)
    requestAnimationFrame(() => fitAddon?.fit())

    resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon?.fit()
        if (term && onResize) {
          onResize(term.cols, term.rows)
        }
      } catch {}
    })
    resizeObserver.observe(containerEl)

    if (!readonly && onWrite) {
      term.onData((data: string) => {
        onWrite!(data)
      })
    }

    connect((data: string) => {
      term?.write(data)
    })

    if (term && onResize) {
      onResize(term.cols, term.rows)
    }
  }

  const destroyTerminal = () => {
    resizeObserver?.disconnect()
    resizeObserver = null
    disconnect()
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

<div
  class="absolute inset-0 px-3 py-2 bg-[#0a0a0a]"
  bind:this={containerEl}
></div>
