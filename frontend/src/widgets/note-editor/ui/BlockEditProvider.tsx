import type { EditorView } from '@tiptap/pm/view'
import type React from 'react'
import { createContext, useContext, useMemo, useReducer, useState } from 'react'
import {
  blockEditMenuReducer,
  type BlockEditMenuState,
} from '../state/useBlockEditMenuStore'
import { BlockHandle } from './BlockHandle'
import type { BlockEditMenuAction } from '../model'

export type HoveredNodeData = {
  rect: DOMRect
  nodePos: number
}

export type BlockEditContextValue = {
  setHoverPos: React.Dispatch<React.SetStateAction<HoveredNodeData | null>>
  hoverPos: HoveredNodeData | null
  mouseInside: boolean
  setMouseInside: React.Dispatch<React.SetStateAction<boolean>>
  state: BlockEditMenuState
  dispatch: React.Dispatch<BlockEditMenuAction>
}

export type BlockHandleState = {
  visible: boolean
  position: HoveredNodeData | null

  moveHandle: (pos: HoveredNodeData) => void
  show: () => void
  hide: () => void
}

const BlockEditContext = createContext<BlockEditContextValue | null>(null)

export function useBlockEdit() {
  const ctx = useContext(BlockEditContext)
  if (!ctx)
    throw new Error('useBlockeEdit must be used within BlockEditProvider')
  return ctx
}


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


export function BlockEditProvider({ children }: { children: React.ReactNode }) {
  const [hoverPos, setHoverPos] = useState<HoveredNodeData | null>(null)
  const [state, dispatch] = useReducer(blockEditMenuReducer, {
    status: 'closed',
  })
  const [mouseInside, setMouseInside] = useState(false)
  const value = useMemo(
    () => ({
      state,
      dispatch,
      hoverPos,
      setHoverPos,
      mouseInside,
      setMouseInside,
    }),
    [hoverPos, state],
  )
  return (
    <BlockEditContext value={value}>
      {children}
      <BlockHandle hoverPos={hoverPos} mouseInside={mouseInside} />
    </BlockEditContext>
  )
}
