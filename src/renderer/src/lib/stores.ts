import { writable } from 'svelte/store'

export const appInfo = writable(null)
export const config = writable(null)
export const connections = writable([])
export const serverInfo = writable(null)
export const appState = writable('loading') // loading | initializing | setup | ready
