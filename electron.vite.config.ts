import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

if (process.platform === 'linux') {
  process.env.ELECTRON_DISABLE_SANDBOX = '1'
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [tailwindcss(), svelte()]
  }
})
