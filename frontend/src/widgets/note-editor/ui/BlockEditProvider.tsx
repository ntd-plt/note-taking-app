import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type React from 'react'
import { createContext, useContext, useState } from 'react'

export type HoverPosition = {
  top: number
  left: number
}

export type BlockEditContextValue = {
  setHoverPos: React.Dispatch<React.SetStateAction<HoverPosition | null>>
  hoverPos: HoverPosition | null
}

const BlockEditContext = createContext<BlockEditContextValue | null>(null)

export function useBlockEdit() {
  const ctx = useContext(BlockEditContext)
  if (!ctx)
    throw new Error('useBlockeEdit must be used within BlockEditProvider')
  return ctx
}

const myPluginKey = new PluginKey('myPlugin')

export function makeHandleDOMEvents() {
  return {
    mousemove: (view: EditorView, event: MouseEvent) => {
      const coords = { left: event.clientX, top: event.clientY }
      const pos = view.posAtCoords(coords)
      if (pos) {
        const resolved = view.state.doc.resolve(pos.pos)
        const dom: Node | null = view.nodeDOM(resolved.pos)
        if (dom instanceof Element) {
        } else {
        }
      }

      return false // don’t block default behavior
    },
  }
}

export function MakeExtension(
  setHoverPos: React.Dispatch<
    React.SetStateAction<{ top: number; left: number } | null>
  >,
) {
  return Extension.create({
    name: 'my-extension',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: myPluginKey,

          state: {
            init() {
              return { count: 0 }
            },
            apply(tr, value) {
              if (tr.docChanged) {
                return { count: value.count + 1 }
              }
              return value
            },
          },

          props: {
            handleDOMEvents: {
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
                      setHoverPos({
                        top: rect.top,
                        left: rect.left,
                      })
                    } else {
                      setHoverPos(null)
                    }
                  } else {
                    setHoverPos(null)
                  }
                }

                return false // don’t block default behavior
              },
            },
            handleTextInput(view, from, to, text) {
              return false // allow default behavior
            },
          },
        }),
      ]
    },
  })
}

export function BlockEditProvider({ children }: { children: React.ReactNode }) {
  const [hoverPos, setHoverPos] = useState<HoverPosition | null>(null)
  const value = { hoverPos, setHoverPos }
  return (
    <div>
      <BlockEditContext.Provider value={value}>
        {children}
        {hoverPos && (
          <BlockHandle position={{ top: hoverPos.top, left: hoverPos.left }} />
        )}
      </BlockEditContext.Provider>
    </div>
  )
}

export function BlockHandle({
  position,
}: {
  position: { top: number; left: number } | null
}) {
  const [lastPos, setLastPos] = useState<HoverPosition | null>(null)
  if (position && position !== lastPos) {
    setLastPos(position)
  }
  return (
    lastPos && (
      <>
        <div
          style={{
            position: 'absolute',
            top: lastPos.top,
            left: lastPos.left,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
          aria-hidden
          className="absolute -left-6 opacity-0 group-hover:opacity-100"
        ></div>
        <div
          className="text"
          style={{
            position: 'fixed',
            top: lastPos.top + 2.5,
            left: lastPos.left - 15,
            zIndex: 50,
            width: 10,
            padding: 0,
          }}
        >
          ⠿
        </div>
      </>
    )
  )
}
