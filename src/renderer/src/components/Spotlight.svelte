<script lang="ts">
  import { onMount } from 'svelte'
  import logoImage from '../lib/assets/images/splash.png'

  let inputEl = $state<HTMLInputElement | null>(null)
  let query = $state('')

  const api = window.spotlightAPI

  const submit = () => {
    const q = query.trim()
    if (!q || !api) return
    api.submitQuery(q)
    query = ''
  }

  onMount(() => {
    inputEl?.focus()
    window.addEventListener('focus', () => {
      query = ''
      inputEl?.focus()
    })
  })
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && api?.closeSpotlight()} />

<div class="wrapper">
  <div class="bar">
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

    <button class="send" class:active={query.trim().length > 0} aria-label="Send" onclick={submit}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  </div>
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
    height: 100%;
    width: 100%;
    padding: 10px 14px 24px 14px;
    display: flex;
    align-items: center;
  }

  .bar {
    width: 100%;
    height: 52px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 9px 0 15px;
    border-radius: 14px;
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-app-region: drag;

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
    -webkit-app-region: no-drag;
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
    -webkit-app-region: no-drag;

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
</style>
