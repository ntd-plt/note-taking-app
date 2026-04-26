import type { MenuAction, MenuState } from '../model'

export function reducer(state: MenuState, action: MenuAction): MenuState {
  console.log('Menu reducer', action)
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
      const next =
        action.direction === 'up'
          ? (state.selectedIndex - 1 + len) % len
          : (state.selectedIndex + 1) % len
      return { ...state, selectedIndex: next }
    }

    case 'CLOSE':
      return { status: 'closed' }
    case 'SELECT':
      if (state.status !== 'open') return state
      const item = state.items[state.selectedIndex]
      state.command(item)
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
