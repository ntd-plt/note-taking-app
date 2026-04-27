import { Button } from '#/components/ui/button'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { GripVertical, GripVerticalIcon } from 'lucide-react'
import { Plugin, PluginKey } from 'prosemirror-state'
import type React from 'react'
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  BlockEditMenu,
  reducer,
  type BlockEditMenuAction,
  type BlockEditMenuItem,
  type BlockEditMenuState,
} from './BlockEditMenu'

export type HoverPosition = {
  rect: DOMRect
  nodePos: number
}

export type BlockEditContextValue = {
  setHoverPos: React.Dispatch<React.SetStateAction<HoverPosition | null>>
  hoverPos: HoverPosition | null
  state: BlockEditMenuState
  dispatch: React.Dispatch<BlockEditMenuAction>
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
  setHoverPos: React.Dispatch<React.SetStateAction<HoverPosition | null>>,
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
  const [state, dispatch] = useReducer(reducer, { status: 'closed' })
  const value = useMemo(
    () => ({ state, dispatch, hoverPos, setHoverPos }),
    [hoverPos, state],
  )
  return (
    <BlockEditContext.Provider value={value}>
      {children}
      <BlockHandle hoverPos={hoverPos} />
    </BlockEditContext.Provider>
  )
}

export function BlockHandle({ hoverPos }: { hoverPos: HoverPosition | null }) {
  const rect = hoverPos?.rect
  const { dispatch } = useBlockEdit()
  const dom = useRef<HTMLDivElement>(null)
  const height = dom.current?.getBoundingClientRect().height ?? 0
  const width = dom.current?.getBoundingClientRect().width ?? 0
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: rect?.top ?? 0,
          left: rect?.left ?? 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
        className="absolute -left-6 opacity-0 group-hover:opacity-100"
      ></div>
      <div
        ref={dom}
        className="text"
        style={{
          opacity: rect ? 100 : 0,
          position: 'fixed',
          top: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 - height / 2,
          left: (rect?.left ?? 0) - 15 - width / 2,
          zIndex: rect ? 50 : -50,
        }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="py-4"
          onClick={() => {
            dispatch({ type: 'OPEN' })
          }}
        >
          <GripVertical strokeWidth={2} className="size-4 opacity-75" />
        </Button>
      </div>
    </>
  )
}
