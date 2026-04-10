<script lang="ts">
  import { onMount } from 'svelte'
  import logoImage from '../lib/assets/images/splash.png'

  let inputEl = $state<HTMLInputElement | null>(null)
  let query = $state('')
  let images = $state<string[]>([])
  let errorMsg = $state('')
  let showHint = $state(true)

  // Bar position within the fullscreen window
  let barX = $state(0)
  let barY = $state(160)
  let screenW = $state(1920)
  let screenH = $state(1080)

  const BAR_W = 748

  const api = window.spotlightAPI

  // ─── Error Toast ───
  let errorTimer: ReturnType<typeof setTimeout> | null = null
  const showError = (msg: string, duration = 4000) => {
    errorMsg = msg
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => { errorMsg = '' }, duration)
  }

  // ─── Submit ───
  const submit = () => {
    const q = query.trim()
    if (!q && images.length === 0) return
    if (!api) return
    // Svelte 5 $state creates Proxy objects that Electron IPC can't serialize.
    // Spread into a plain array of plain strings for structured clone.
    const plainImages = images.length > 0 ? [...images].map((s) => s.slice(0)) : undefined
    api.submitQuery(q, plainImages)
    query = ''
    images = []
  }

  // ─── Bar Dragging ───
  let barDragging = $state(false)
  let barDragStart = { mx: 0, my: 0, bx: 0, by: 0 }

  const onBarMouseDown = (e: MouseEvent) => {
    // Only drag from the bar background, not from input or buttons
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.closest('button') || target.closest('.preview')) return
    e.preventDefault()
    barDragging = true
    barDragStart = { mx: e.clientX, my: e.clientY, bx: barX, by: barY }
  }

  // ─── Region Selection ───
  let selecting = $state(false)
  let selStart = { x: 0, y: 0 }
  let selRect = $state({ x: 0, y: 0, w: 0, h: 0 })
  let didDrag = false
  const DRAG_THRESHOLD = 8

  const onWrapperMouseDown = (e: MouseEvent) => {
    // Ignore if it's on the bar or preview
    if ((e.target as HTMLElement).closest('.bar') || (e.target as HTMLElement).closest('.preview')) return
    e.preventDefault()
    selStart = { x: e.clientX, y: e.clientY }
    selecting = true
    didDrag = false
    selRect = { x: e.clientX, y: e.clientY, w: 0, h: 0 }
  }

  const onMouseMove = (e: MouseEvent) => {
    if (barDragging) {
      const dx = e.clientX - barDragStart.mx
      const dy = e.clientY - barDragStart.my
      barX = Math.max(0, Math.min(screenW - BAR_W, barDragStart.bx + dx))
      barY = Math.max(0, Math.min(screenH - 60, barDragStart.by + dy))
      return
    }
    if (selecting) {
      const dx = e.clientX - selStart.x
      const dy = e.clientY - selStart.y
      if (!didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        didDrag = true
      }
      selRect = {
        x: Math.min(e.clientX, selStart.x),
        y: Math.min(e.clientY, selStart.y),
        w: Math.abs(dx),
        h: Math.abs(dy)
      }
    }
  }

  const onMouseUp = async (e: MouseEvent) => {
    if (barDragging) {
      barDragging = false
      api?.savePosition({ x: barX, y: barY })
      return
    }
    if (selecting) {
      selecting = false
      showHint = false
      if (didDrag && selRect.w > 10 && selRect.h > 10) {
        // Capture the selected region
        const result = await api?.captureRegion({
          x: selRect.x,
          y: selRect.y,
          width: selRect.w,
          height: selRect.h
        })
        if (result === 'no-permission') {
          showError('Screen Recording permission required. Opening System Settings…')
        } else if (result && typeof result === 'string' && result.startsWith('data:')) {
          images = [...images, result]
        } else if (!result) {
          showError('Screenshot capture failed.')
        }
        selRect = { x: 0, y: 0, w: 0, h: 0 }
      } else {
        // Click on background (not a drag) — dismiss
        selRect = { x: 0, y: 0, w: 0, h: 0 }
        api?.closeSpotlight()
      }
    }
  }

  const removeImage = (index: number) => {
    images = images.filter((_, i) => i !== index)
  }

  onMount(() => {
    inputEl?.focus()
    window.addEventListener('focus', () => {
      inputEl?.focus()
    })

    api?.onInit?.((data) => {
      if (data.screenSize) {
        screenW = data.screenSize.width
        screenH = data.screenSize.height
      }
      if (data.barOffset) {
        barX = data.barOffset.x
        barY = data.barOffset.y
      } else {
        // Default: center horizontally, near top
        barX = Math.round((screenW - BAR_W) / 2)
        barY = 160
      }
      if (data.query) {
        query = data.query
        requestAnimationFrame(() => inputEl?.select())
      }
      requestAnimationFrame(() => inputEl?.focus())

      // Show screenshot hint
      showHint = true
    })
  })
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && api?.closeSpotlight()}
  onmousemove={onMouseMove}
  onmouseup={onMouseUp}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wrapper" onmousedown={onWrapperMouseDown}>
  <!-- Screen capture overlay -->
  {#if selecting && didDrag}
    <!-- Selection with shadow-based dimming -->
    <div
      class="selection"
      style="left:{selRect.x}px;top:{selRect.y}px;width:{selRect.w}px;height:{selRect.h}px"
    >
      <div class="handle tl"></div>
      <div class="handle tr"></div>
      <div class="handle bl"></div>
      <div class="handle br"></div>
    </div>
    <!-- Dimensions label -->
    <div
      class="dimensions"
      style="left:{selRect.x + selRect.w / 2}px;top:{selRect.y + selRect.h + 12}px"
    >
      {Math.round(selRect.w)} × {Math.round(selRect.h)}
    </div>
  {/if}

  <!-- Floating bar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bar"
    style="left:{barX}px;top:{barY}px"
    onmousedown={onBarMouseDown}
  >
    {#if images.length > 0}
      <div class="attachments">
        {#each images as img, i}
          <div class="preview-item">
            <img src={img} alt="Screenshot {i + 1}" />
            <button class="preview-remove" onclick={() => removeImage(i)} aria-label="Remove">×</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="input-row">
      <img class="logo" src={logoImage} alt="" />

      <input
        bind:this={inputEl}
        bind:value={query}
        type="text"
        placeholder="What can I help you with today?"
        autocomplete="off"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />

      <button class="send" class:active={query.trim().length > 0 || images.length > 0} aria-label="Send" onclick={submit}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Screenshot hint -->
  {#if showHint && images.length === 0 && !selecting}
    <div class="hint">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 8V6a2 2 0 012-2h2" /><path d="M4 16v2a2 2 0 002 2h2" /><path d="M16 4h2a2 2 0 012 2v2" /><path d="M16 20h2a2 2 0 002-2v-2" />
      </svg>
      Drag anywhere to capture a screenshot
    </div>
  {/if}

  <!-- Error toast -->
  {#if errorMsg}
    <div class="error-toast">{errorMsg}</div>
  {/if}
</div>

<style>
  @font-face {
    font-family: 'Archivo';
    src: url('../lib/assets/fonts/Archivo-Variable.ttf');
    font-display: swap;
  }
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(html), :global(body), :global(#app) {
    height: 100%;
    width: 100%;
    background: transparent;
    overflow: hidden;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }

  .wrapper {
    position: fixed;
    inset: 0;
    cursor: crosshair;
  }

  .selection {
    position: absolute;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 2px;
    pointer-events: none;
    z-index: 10;
    /* Massive spread shadow dims everything outside the selection */
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  }

  .handle {
    position: absolute;
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 1px;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.4);
  }
  .handle.tl { top: -3px; left: -3px; }
  .handle.tr { top: -3px; right: -3px; }
  .handle.bl { bottom: -3px; left: -3px; }
  .handle.br { bottom: -3px; right: -3px; }

  .dimensions {
    position: absolute;
    transform: translateX(-50%);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    pointer-events: none;
    z-index: 11;
    white-space: nowrap;
  }

  .bar {
    position: absolute;
    width: 748px;
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    cursor: grab;
    z-index: 100;
    overflow: hidden;

    background: #f5f5f7;
    color: #1d1d1f;
    border: 0.5px solid rgba(0, 0, 0, 0.08);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.06),
      0 8px 24px rgba(0, 0, 0, 0.1);
  }

  @media (prefers-color-scheme: dark) {
    .bar {
      background: #1a1a1c;
      color: #fafafa;
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.2),
        0 8px 24px rgba(0, 0, 0, 0.35);
    }
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 52px;
    padding: 0 9px 0 15px;
  }

  .logo {
    width: 25px;
    height: 25px;
    flex-shrink: 0;
    object-fit: contain;
    opacity: 0.8;
  }

  @media (prefers-color-scheme: dark) {
    .logo { filter: invert(1); }
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 17px;
    font-weight: 450;
    line-height: 1;
    letter-spacing: -0.01em;
    color: #1d1d1f;
    cursor: text;
  }

  input::placeholder {
    color: rgba(0, 0, 0, 0.22);
  }

  @media (prefers-color-scheme: dark) {
    input { color: #fafafa; }
    input::placeholder { color: rgba(255, 255, 255, 0.18); }
  }

  .send {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    outline: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;

    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.18);
  }

  .send.active {
    background: #1d1d1f;
    color: #fff;
  }

  .send.active:hover { opacity: 0.8; }
  .send.active:active { transform: scale(0.92); }

  @media (prefers-color-scheme: dark) {
    .send {
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.15);
    }
    .send.active {
      background: #fafafa;
      color: #1d1d1f;
    }
  }

  /* ─── Inline Attachments ─── */
  .attachments {
    display: flex;
    gap: 6px;
    padding: 10px 12px 0;
    flex-wrap: wrap;
  }

  .preview-item {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .preview-item:hover .preview-remove {
    opacity: 1;
  }

  /* ─── Error Toast ─── */
  .error-toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 10px;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: rgba(220, 38, 38, 0.9);
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    z-index: 200;
    pointer-events: none;
    animation: toast-in 0.25s ease-out;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ─── Screenshot Hint ─── */
  .hint {
    position: fixed;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 10px;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 13px;
    font-weight: 450;
    z-index: 200;
    pointer-events: none;
    animation: hint-in 0.25s ease-out;

    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
  }

  @keyframes hint-in {
    from { opacity: 0; transform: translateX(-50%) translateY(6px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
