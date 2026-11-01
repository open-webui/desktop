import tippy, { type Props } from 'tippy.js'
import 'tippy.js/dist/tippy.css'

export function tooltip(node: HTMLElement, content: string | Partial<Props>) {
  const options: Partial<Props> = {
    placement: 'top',
    theme: 'dark',
    arrow: false,
    offset: [0, 4],
    ...(typeof content === 'string' ? { content } : content)
  }

  const instance = tippy(node, options)

  return {
    update(newContent: string | Partial<Props>) {
      const newOptions: Partial<Props> =
        typeof newContent === 'string'
          ? { content: newContent }
          : newContent
      instance.setProps(newOptions)
    },
    destroy() {
      instance.destroy()
    }
  }
}
