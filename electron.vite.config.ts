import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

if (process.platform === 'linux') {
  process.env.ELECTRON_DISABLE_SANDBOX = '1'
}

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'content-preload': resolve(__dirname, 'src/preload/content-preload.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [tailwindcss(), svelte()]
  }
})
