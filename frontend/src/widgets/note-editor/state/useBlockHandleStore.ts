import { create } from 'zustand'

export type HoveredNodeData = {
  rect: DOMRect
  nodePos: number
}

export type BlockHandleState = {
  visible: boolean
  position: HoveredNodeData | null

  moveHandle: (pos: HoveredNodeData) => void
  show: () => void
  hide: () => void
}

export const useBlockHandleStore = create<BlockHandleState>((set) => ({
  visible: false,
  position: null,
  moveHandle: (pos: HoveredNodeData) => {
    set({ position: pos })
  },
  show: () => {
    set({ visible: true })
  },
  hide: () => {
    set({ visible: false })
  },
}))
