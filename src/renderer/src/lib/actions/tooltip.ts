import tippy, { type Props } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/translucent.css'

export function tooltip(node: HTMLElement, content: string | Partial<Props>) {
  const options: Partial<Props> =
    typeof content === 'string'
      ? { content, placement: 'bottom', theme: 'translucent', delay: [500, 0] }
      : { placement: 'bottom', theme: 'translucent', delay: [500, 0], ...content }

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
