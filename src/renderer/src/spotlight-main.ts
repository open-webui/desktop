import { mount } from 'svelte'
import Spotlight from './components/Spotlight.svelte'

const app = mount(Spotlight, {
  target: document.getElementById('app')!
})

export default app
