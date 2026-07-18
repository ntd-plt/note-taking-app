import type { MenuAction, MenuState } from '../model'

export function reducer(state: MenuState, action: MenuAction): MenuState {
  switch (action.type) {
    case 'OPEN':
    case 'UPDATE':
      const rect = action.props.clientRect?.()
      if (!rect) return state
      return {
        status: 'open',
        items: action.props.items,
        selectedIndex: 0,
        position: rectToPosition(rect),
        command: (item) => action.props.command(item),
      }

    case 'MOVE': {
      if (state.status !== 'open') return state
      const len = state.items.length
      const newIndex =
        action.index < 0 ? len - 1 : action.index >= len ? 0 : action.index
      return { ...state, selectedIndex: newIndex }
    }

    case 'CLOSE':
      return { status: 'closed' }
  }
}

function rectToPosition(rect: DOMRect): {
  top: number
  left: number
} {
  return {
    top: rect.bottom + window.scrollY + 6,
    left: rect.left + window.scrollX,
  }
}
