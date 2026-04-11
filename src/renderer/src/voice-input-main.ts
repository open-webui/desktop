import { mount } from 'svelte'
import VoiceInput from './components/VoiceInput.svelte'

const app = mount(VoiceInput, {
  target: document.getElementById('app')!
})

export default app
