import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { ResolvedPos } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const NODE_HOVER_PLUGIN_KEY = new PluginKey('node-hover-plugin')

export type HoveredNode = {
  rowNumber: number
  rect: DOMRect
  type: string
}

export type NodeHoverPluginState = {
  isMouseInside: boolean
  hoveredNode: HoveredNode | null
}

/**
 * Walks down the resolved position from depth 1 and returns the position
 * (before the node) of the first block that is NOT a list wrapper or custom layout container.
 */
function resolveHoverNode(resolved: ResolvedPos): {
  row: number
  type: string
} | null {
  for (let depth = 1; depth <= resolved.depth; depth++) {
    const node = resolved.node(depth)
    const isListWrapper =
      node.type.name === 'bulletList' || node.type.name === 'orderedList'
    const isCustomLayoutNode = node.type.name === 'customLayout' || node.type.name === 'layoutCell'
    if (!isListWrapper && !isCustomLayoutNode) {
      return {
        row: resolved.before(depth),
        type: node.type.name,
      }
    }
  }
  return null
}

export const NodeHoverExtension = Extension.create({
  name: 'node-hover-extension',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: NODE_HOVER_PLUGIN_KEY,

        state: {
          init(): NodeHoverPluginState {
            return { isMouseInside: false, hoveredNode: null }
          },
          apply(tr, value): NodeHoverPluginState {
            const meta: NodeHoverPluginState | undefined = tr.getMeta(
              NODE_HOVER_PLUGIN_KEY,
            )
            if (meta) return meta
            if (tr.docChanged)
              return { isMouseInside: false, hoveredNode: null }
            return value
          },
        },

        props: {
          decorations(state) {
            const pluginState = NODE_HOVER_PLUGIN_KEY.getState(state)
            if (!pluginState || !pluginState.hoveredNode) return null

            const { rowNumber } = pluginState.hoveredNode
            const node = state.doc.nodeAt(rowNumber)
            if (!node) return DecorationSet.empty
            return DecorationSet.create(state.doc, [
              Decoration.node(rowNumber, rowNumber + node.nodeSize, {
                class: 'block-handle-hovered',
              }),
            ])
          },
          handleDOMEvents: {
            mousemove: (view, event) => {
              const coords = { left: event.clientX, top: event.clientY }
              const pos = view.posAtCoords(coords)
              if (!pos) return false

              const resolved = view.state.doc.resolve(pos.pos)
              const { row, type } = resolveHoverNode(resolved) || {
                row: null,
                type: null,
              }

              if (row !== null) {
                const dom = view.nodeDOM(row)
                if (dom instanceof Element) {
                  const rect = dom.getBoundingClientRect()
                  view.dispatch(
                    view.state.tr.setMeta(NODE_HOVER_PLUGIN_KEY, {
                      isMouseInside: true,
                      hoveredNode: {
                        rowNumber: row,
                        rect,
                        type,
                      },
                    }),
                  )
                }
              }

              return false
            },
          },
        },
      }),
    ]
  },
})
