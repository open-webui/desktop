<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  const api = window.voiceInputAPI

  let recording = $state(false)
  let transcribing = $state(false)
  let duration = $state(0)
  let errorMsg = $state('')

  // Waveform
  let levels: number[] = $state(Array(5).fill(0.15))
  let animFrame: number | null = null

  let timer: ReturnType<typeof setInterval> | null = null
  let errorTimer: ReturnType<typeof setTimeout> | null = null

  // Audio
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let mediaStream: MediaStream | null = null
  let analyser: AnalyserNode | null = null
  let audioCtx: AudioContext | null = null
  let dataArray: Uint8Array | null = null

  // Dragging
  let dragging = false
  let dragStart = { mx: 0, my: 0, wx: 0, wy: 0 }

  const formatDuration = (s: number): string => {
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  const animateLevel = () => {
    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray)
      // Sample 5 frequency bands
      const bands = 5
      const step = Math.floor(dataArray.length / bands)
      levels = Array.from({ length: bands }, (_, i) => {
        const val = dataArray![i * step] / 255
        return Math.max(0.15, val)
      })
    } else {
      levels = levels.map(() => 0.15 + Math.random() * 0.6)
    }
    animFrame = requestAnimationFrame(animateLevel)
  }

  const showError = (msg: string) => {
    errorMsg = msg
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      errorMsg = ''
      api?.close()
    }, 3000)
  }

  const startRecording = async () => {
    // Reset all state from any previous session
    cleanup()
    errorMsg = ''
    transcribing = false
    recording = true
    duration = 0
    audioChunks = []
    animateLevel() // show placeholder bars immediately

    // Wait for the start chime (played from main process) to finish
    // before activating mic — macOS ducks audio when mic activates
    await new Promise((r) => setTimeout(r, 500))

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunks = []

      // Set up analyser for real audio levels
      audioCtx = new AudioContext()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      dataArray = new Uint8Array(analyser.frequencyBinCount)
      const source = audioCtx.createMediaStreamSource(mediaStream)
      source.connect(analyser)

      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.start(250)
      timer = setInterval(() => { duration++ }, 1000)
    } catch (err: any) {
      showError(err?.message || 'Mic access failed')
    }
  }

  const cleanup = () => {
    recording = false
    transcribing = false
    if (timer) { clearInterval(timer); timer = null }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
    levels = Array(5).fill(0.15)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
    }
    if (audioCtx) {
      audioCtx.close()
      audioCtx = null
      analyser = null
    }
    mediaRecorder = null
  }

  const cancelRecording = () => {
    cleanup()
    api?.close()
  }

  const stopRecording = async () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      cancelRecording()
      return
    }

    // Too short — treat as cancel (less than 0.8 seconds)
    if (duration < 1) {
      cancelRecording()
      return
    }

    recording = false
    if (timer) { clearInterval(timer); timer = null }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
    levels = Array(5).fill(0.15)

    const audioBlob = await new Promise<Blob>((resolve) => {
      mediaRecorder!.onstop = () => {
        resolve(new Blob(audioChunks, { type: mediaRecorder!.mimeType }))
      }
      mediaRecorder!.stop()
    })

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
    }
    if (audioCtx) {
      audioCtx.close()
      audioCtx = null
      analyser = null
    }

    if (audioBlob.size < 4096) {
      api?.close()
      return
    }

    transcribing = true
    try {
      const buffer = await audioBlob.arrayBuffer()
      const result = await api?.transcribe(buffer)
      const text = result?.text?.trim()
      if (text) {
        api?.done(text)
      } else {
        api?.close()
      }
    } catch (err: any) {
      showError(err?.message || 'Transcription failed')
    }
  }

  const onMouseDown = (e: MouseEvent) => {
    dragging = true
    dragStart = { mx: e.screenX, my: e.screenY, wx: window.screenX, wy: window.screenY }
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return
    window.moveTo(
      dragStart.wx + (e.screenX - dragStart.mx),
      dragStart.wy + (e.screenY - dragStart.my)
    )
  }

  const onMouseUp = () => { dragging = false }

  onMount(() => {
    api?.onRecordingState((data) => {
      if (data.recording && !recording) startRecording()
      else if (!data.recording && recording) stopRecording()
    })
  })

  onDestroy(() => {
    cleanup()
    if (errorTimer) clearTimeout(errorTimer)
  })
</script>

<svelte:window
  onkeydown={(e) => { if (e.key === 'Escape') cancelRecording() }}
  onmousemove={onMouseMove}
  onmouseup={onMouseUp}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pill" onmousedown={onMouseDown}>
  {#if recording}
    <div class="bars">
      {#each levels as level}
        <div class="bar" style="height: {6 + level * 22}px"></div>
      {/each}
    </div>
    <span class="time">{formatDuration(duration)}</span>
  {:else if transcribing}
    <div class="loader"></div>
  {:else if errorMsg}
    <span class="err">{errorMsg}</span>
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
    height: 100%; width: 100%;
    background: transparent;
    overflow: hidden;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }

  .pill {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    height: 44px;
    border-radius: 22px;
    cursor: grab;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    animation: appear 0.15s ease-out;

    background: rgba(30, 30, 30, 0.78);
    backdrop-filter: blur(40px) saturate(1.8);
    -webkit-backdrop-filter: blur(40px) saturate(1.8);
    border: 0.5px solid rgba(255, 255, 255, 0.12);
    box-shadow:
      0 2px 12px rgba(0, 0, 0, 0.35),
      inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
  }

  .pill:active { cursor: grabbing; }

  @keyframes appear {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  .bars {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 28px;
  }

  .bar {
    width: 4px;
    border-radius: 99px;
    background: #fff;
    opacity: 0.9;
    transition: height 60ms ease-out;
    min-height: 6px;
  }

  .time {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: 0.01em;
  }

  .loader {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .err {
    font-size: 12px;
    font-weight: 500;
    color: #ff6b6b;
  }
</style>
