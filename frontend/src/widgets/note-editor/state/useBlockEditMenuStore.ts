import { create } from 'zustand'
import { redux } from 'zustand/middleware'
import type { BlockEditMenuAction, BlockEditMenuItem } from '../model'
import { BLOCK_EDIT_COMMANDS, BLOCK_EDIT_SUBCOMMANDS } from '../data/commands'

export const useBlockEditMenuStore = create(
  redux(blockEditMenuReducer, {
    status: 'closed',
  }),
)

export type BlockEditMenuState =
  | { status: 'closed' }
  | {
      status: 'open'
      nested: boolean
      items: BlockEditMenuItem[]
      selectedIndex: number
    }

export function blockEditMenuReducer(
  state: BlockEditMenuState,
  action: BlockEditMenuAction,
): BlockEditMenuState {
  switch (action.type) {
    case 'OPEN':
    case 'UPDATE':
      return {
        nested: false,
        status: 'open',
        items: BLOCK_EDIT_COMMANDS,
        selectedIndex: 0,
      }

    case 'MOVE': {
      if (state.status !== 'open') return state
      const len = state.items.length
      const newIndex =
        action.index < 0 ? len - 1 : action.index >= len ? 0 : action.index
      return { ...state, selectedIndex: newIndex }
    }

    case 'SUBMENU':
      if (state.status !== 'open' || state.nested) return state
      return {
        ...state,
        items: BLOCK_EDIT_SUBCOMMANDS,
        nested: true,
      }

    case 'BACK':
      if (state.status !== 'open' || !state.nested) return state
      return {
        ...state,
        items: BLOCK_EDIT_COMMANDS,
        nested: false,
      }

    case 'CLOSE':
      return { status: 'closed' }
  }
}
