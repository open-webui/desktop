import { writable } from 'svelte/store'
import type { UpdateState } from '../../../shared/updater'

export const appInfo = writable(null)
export const config = writable(null)
export const serverInfo = writable(null)
export const appState = writable('loading') // loading | initializing | setup | ready

export const desktopUpdate = writable<UpdateState>({ status: 'idle' })
