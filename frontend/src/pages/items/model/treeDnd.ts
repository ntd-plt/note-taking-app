import type { Item, SidebarItem } from '#/widgets/note-editor/model'

/** Droppable id of the whole tree area: dropping there moves items to the top level. */
export const ROOT_DROP_ID = '__root__'

/** The tree flattened in the order rows appear on screen (collapsed folders hide their children). */
export function flattenVisible(tree: SidebarItem[]): string[] {
  const out: string[] = []
  const walk = (items: SidebarItem[]) => {
    for (const item of items) {
      out.push(item.id)
      if (item.type === 'folder' && item.isExpanded) walk(item.children)
    }
  }
  walk(tree)
  return out
}

export function rangeBetween(
  visible: string[],
  from: string,
  to: string,
): string[] {
  const a = visible.indexOf(from)
  const b = visible.indexOf(to)
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
  items: Item[],
): DropTarget | undefined {
  if (overId === null) return undefined
  if (overId === ROOT_DROP_ID) return { destinationId: null }
  const over = items.find((i) => i.id === overId)
  if (!over) return undefined
  return { destinationId: over.type === 'folder' ? over.id : over.parentId }
}
