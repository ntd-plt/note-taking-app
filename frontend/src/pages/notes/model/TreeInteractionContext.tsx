import * as React from 'react'
import type { ItemRef } from '#/shared/lib/hierarchy'

export interface TreeInteraction {
  /** `type:id` keys of the multi-selected rows. */
  selectedKeys: ReadonlySet<string>
  /** Folder ids that cannot receive the current drag (selected folders and their descendants). */
  invalidTargetIds: ReadonlySet<string>
  /** `type:id` keys of the rows being dragged right now. */
  draggingKeys: ReadonlySet<string>
  /** Folder id currently highlighted as the drop destination. */
  dropFolderId: string | null
  /**
   * Handles a row click. Ctrl/Cmd toggles and Shift extends the selection; a plain click
   * clears it and runs `open` (open the note / toggle the folder).
   */
  onRowClick: (ref: ItemRef, e: React.MouseEvent, open: () => void) => void
}

const noop = new Set<string>()

// The default keeps a row usable outside the Sidebar: plain clicks just open it.
const TreeInteractionContext = React.createContext<TreeInteraction>({
  selectedKeys: noop,
  invalidTargetIds: noop,
  draggingKeys: noop,
  dropFolderId: null,
  onRowClick: (_ref, _e, open) => open(),
})

export const TreeInteractionProvider = TreeInteractionContext.Provider

export function useTreeInteraction() {
  return React.useContext(TreeInteractionContext)
}
