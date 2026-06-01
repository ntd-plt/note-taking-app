import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type { ResolvedPos } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const BLOCK_HANDLE_PLUGIN_KEY = new PluginKey('block-handle-plugin')

export type HoveredNode = {
  rowNumber: number
  rect: DOMRect
  type: 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | string // include custom block types
}

export type BlockHandlePluginState = {
  isMouseInside: boolean
  hoveredNode: HoveredNode | null
}

/**
 * Walks down the resolved position from depth 1 and returns the position
 * (before the node) of the first block that is NOT a list wrapper.
 *
 * This ensures:
 *  - Regular blocks (paragraph, heading…) → resolved at depth 1
 *  - List items → resolved at depth 2, skipping the bulletList/orderedList
 *  - Nested lists → resolved at the innermost listItem
 */
function resolveHandleNode(resolved: ResolvedPos): {
  row: number
  type: string
} | null {
  for (let depth = 1; depth <= resolved.depth; depth++) {
    const node = resolved.node(depth)
    const isListWrapper =
      node.type.name === 'bulletList' || node.type.name === 'orderedList'
    if (!isListWrapper) {
      return {
        row: resolved.before(depth),
        type: node.type.name,
      }
    }
  }
  return null
}

export function BlockHandleExtension() {
  return Extension.create({
    name: 'block-handle-extension',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: BLOCK_HANDLE_PLUGIN_KEY,

          state: {
            init(): BlockHandlePluginState {
              return { isMouseInside: false, hoveredNode: null }
            },
            apply(tr, value): BlockHandlePluginState {
              const meta: BlockHandlePluginState | undefined = tr.getMeta(
                BLOCK_HANDLE_PLUGIN_KEY,
              )
              if (meta) return meta
              if (tr.docChanged)
                return { isMouseInside: false, hoveredNode: null }
              return value
            },
          },

          props: {
            decorations(state) {
              const pluginState = BLOCK_HANDLE_PLUGIN_KEY.getState(state)
              if (
                !pluginState ||
                !pluginState.hoveredNode
              )
                return null

              const { rowNumber } = pluginState.hoveredNode
              const node = state.doc.nodeAt(rowNumber)
              if (!node) return DecorationSet.empty
              return DecorationSet.create(state.doc, [
                Decoration.node(
                  rowNumber,
                  rowNumber + node.nodeSize,
                  {
                    class: 'block-handle-hovered',
                  },
                ),
              ])
            },
            handleDOMEvents: {
              mousemove: (view, event) => {
                const coords = { left: event.clientX, top: event.clientY }
                const pos = view.posAtCoords(coords)
                if (!pos) return false

                const resolved = view.state.doc.resolve(pos.pos)
                const { row, type } = resolveHandleNode(resolved) || {
                  row: null,
                  type: null,
                }

                if (row !== null) {
                  const dom = view.nodeDOM(row)
                  if (dom instanceof Element) {
                    const rect = dom.getBoundingClientRect()
                    view.dispatch(
                      view.state.tr.setMeta(BLOCK_HANDLE_PLUGIN_KEY, {
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

                return false // don't block default behavior
              },
            },
          },
        }),
      ]
    },
  })
}
