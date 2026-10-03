import type { Folder, Note, SidebarItem } from '#/widgets/note-editor/model'
import type { ItemRef } from '#/shared/lib/hierarchy'

/** Droppable id of the whole tree area: dropping there moves items to the top level. */
export const ROOT_DROP_ID = '__root__'

export const itemKey = (ref: ItemRef) => `${ref.type}:${ref.id}`

export function sameItem(a: ItemRef, b: ItemRef) {
  return a.id === b.id && a.type === b.type
}

/** The tree flattened in the order rows appear on screen (collapsed folders hide their children). */
export function flattenVisible(tree: SidebarItem[]): ItemRef[] {
  const out: ItemRef[] = []
  const walk = (items: SidebarItem[]) => {
    for (const item of items) {
      out.push({ id: item.id, type: item.type })
      if (item.type === 'folder' && item.data.isExpanded) walk(item.children)
    }
  }
  walk(tree)
  return out
}

/** Items between two rows (inclusive) in visible order; falls back to `to` alone. */
export function rangeBetween(
  visible: ItemRef[],
  from: ItemRef,
  to: ItemRef,
): ItemRef[] {
  const a = visible.findIndex((i) => sameItem(i, from))
  const b = visible.findIndex((i) => sameItem(i, to))
  if (a === -1 || b === -1) return [to]
  const [start, end] = a < b ? [a, b] : [b, a]
  return visible.slice(start, end + 1)
}

export interface DropTarget {
  /** Destination folder id, or null for the top level. */
  destinationId: string | null
}

/**
 * Turns whatever the pointer is over into a destination. A folder is itself the
 * destination, a note stands for its parent folder, and the tree area is the top level.
 * Returns undefined when nothing droppable is under the pointer.
 */
export function resolveDropTarget(
  overId: string | null,
  folders: Folder[],
  notes: Note[],
): DropTarget | undefined {
  if (overId === null) return undefined
  if (overId === ROOT_DROP_ID) return { destinationId: null }
  const folder = folders.find((f) => f.id === overId)
  if (folder) return { destinationId: folder.id }
  const note = notes.find((n) => n.id === overId)
  if (note) return { destinationId: note.parentId }
  return undefined
}
