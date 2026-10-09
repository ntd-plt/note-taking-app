import * as React from 'react'

export interface TreeInteraction {
  selectedIds: ReadonlySet<string>
  invalidTargetIds: ReadonlySet<string>
  draggingIds: ReadonlySet<string>
  /** Folder id currently highlighted as the drop destination. */
  dropFolderId: string | null
  onRowClick: (id: string, e: React.MouseEvent, open: () => void) => void
}

const noop = new Set<string>()

// The default keeps a row usable outside the Sidebar: plain clicks just open it.
const TreeInteractionContext = React.createContext<TreeInteraction>({
  selectedIds: noop,
  invalidTargetIds: noop,
  draggingIds: noop,
  dropFolderId: null,
  onRowClick: (_id, _e, open) => open(),
})

export const TreeInteractionProvider = TreeInteractionContext.Provider

export function useTreeInteraction() {
  return React.useContext(TreeInteractionContext)
}
