import { create } from 'zustand'
import type {
  BlockEditMenuAction,
  BlockEditMenuState,
} from './useBlockEditMenuStore'

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

export type BlockEditState = {
  handleVisible: boolean
  position: HoveredNodeData | null
  menuState: BlockEditMenuState
  menuDispatch: React.Dispatch<BlockEditMenuAction> | null

  moveHandle: (pos: HoveredNodeData) => void
  show: () => void
  hide: () => void
}

const useBlockEditStore = create<BlockEditState>((set) => ({
  handleVisible: false,
  position: null,
  menuState: { status: 'closed' },
  menuDispatch: null,

  moveHandle: (pos: HoveredNodeData) => {
    set({ position: pos })
  },
  show: () => {
    set({ handleVisible: true })
  },
  hide: () => {
    set({ handleVisible: false })
  },
}))

const BlockEditContext = createContext<BlockEditContextValue | null>(null)

export function useBlockEdit() {
  const ctx = useContext(BlockEditContext)
  if (!ctx)
    throw new Error('useBlockeEdit must be used within BlockEditProvider')
  return ctx
}
