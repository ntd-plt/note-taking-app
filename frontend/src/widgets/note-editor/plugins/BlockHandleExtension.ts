import type { HoveredNodeData } from '../model'

import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'

const myPluginKey = new PluginKey('myPlugin')

export function MakeBlockHandleExtension(
  setMouseInside: React.Dispatch<React.SetStateAction<boolean>>,
  setHoverPos: React.Dispatch<React.SetStateAction<HoveredNodeData | null>>,
) {
  return Extension.create({
    name: 'my-extension',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: myPluginKey,

          state: {
            init() {
              return {}
            },
            apply(tr, value) {
              if (tr.docChanged) {
                setHoverPos(null)
                return {}
              }
              return value
            },
          },

          props: {
            handleDOMEvents: {
              mouseenter: () => {
                setMouseInside(true)
              },
              mousemove: (view, event) => {
                const coords = { left: event.clientX, top: event.clientY }
                const pos = view.posAtCoords(coords)
                if (pos) {
                  const resolved = view.state.doc.resolve(pos.pos)
                  const node = resolved.node(1)
                  if (node) {
                    const resolvedNode = view.state.doc.resolve(
                      resolved.before(1),
                    )
                    const dom: Node | null = view.nodeDOM(resolvedNode.pos)
                    if (dom instanceof Element) {
                      const rect = dom.getBoundingClientRect()
                      setHoverPos({ rect, nodePos: resolvedNode.pos })
                    }
                  }
                }

                return false // don’t block default behavior
              },
            },
          },
        }),
      ]
    },
  })
}
