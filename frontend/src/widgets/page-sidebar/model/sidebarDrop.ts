// The sidebar's drop rules, turned into a move op:
// - onto a page: the dragged page becomes the last item of its content (the
//   server puts it before the trailing empty paragraph);
// - between two rows: right after the row above, under that page's direct parent,
//   which may be a block;
// - first in a group (the row below is a child of the row above), or at the very
//   top: right before the row below, under its direct parent.
// Drops into the dragged page or anything below it are refused, and so are drops
// that would leave it where it is.
//
// Resolving happens in two steps because a position is an index into the parent's
// childIds, and the sidebar knows those only for pages and the workspace. When the
// parent is a block, the caller fetches the page holding it first.
import type { Item, Op } from '#/entities/item'
import type { PageNode } from './pageTree'

export type SidebarDrop =
  | { kind: 'onto'; pageId: string }
  // The gap above rows[index]; index === rows.length is below the last row.
  | { kind: 'gap'; index: number }

export type SidebarPlacement =
  | { kind: 'onto'; pageId: string }
  | {
      kind: 'beside'
      parentId: string
      anchorId: string
      side: 'after' | 'before'
    }

export function resolveSidebarDrop(
  draggedId: string,
  drop: SidebarDrop,
  rows: readonly PageNode[],
  pages: readonly Item[],
): SidebarPlacement | null {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const insideDragged = (id: string) => {
    for (let p = byId.get(id); p; p = byId.get(p.parentPageId ?? '')) {
      if (p.id === draggedId) return true
    }
    return false
  }

  if (drop.kind === 'onto') {
    return insideDragged(drop.pageId) ? null : drop
  }

  const above = drop.index > 0 ? rows.at(drop.index - 1) : undefined
  const below = rows.at(drop.index)
  const firstInGroup = !above || (below && below.depth > above.depth)
  const anchor = firstInGroup ? below : above
  if (!anchor || anchor.item.parentId === null) return null
  if (anchor.item.id === draggedId || insideDragged(anchor.item.id)) return null
  return {
    kind: 'beside',
    parentId: anchor.item.parentId,
    anchorId: anchor.item.id,
    side: firstInGroup ? 'before' : 'after',
  }
}

// knownChildIds returns a parent's childIds when /pages tells them: for a listed
// page, and for the workspace (whose children are exactly the top-level pages).
// For a block it returns undefined.
export function knownChildIds(
  parentId: string,
  pages: readonly Item[],
): string[] | undefined {
  const page = pages.find((p) => p.id === parentId)
  if (page) return page.childIds
  const top = pages.filter((p) => p.parentPageId === null)
  if (top.length > 0 && top[0].parentId === parentId)
    return top.map((p) => p.id)
  return undefined
}

// placementToMove builds the move op, or null when the page would stay put.
// siblings is the parent's current childIds, needed for a placement beside a page.
export function placementToMove(
  draggedId: string,
  placement: SidebarPlacement,
  siblings?: readonly string[],
): Op | null {
  if (placement.kind === 'onto') {
    return { op: 'move', id: draggedId, parentId: placement.pageId }
  }
  if (!siblings) throw new Error(`children of ${placement.parentId} unknown`)
  const others = siblings.filter((id) => id !== draggedId)
  const at = others.indexOf(placement.anchorId)
  if (at < 0) throw new Error(`${placement.anchorId} is not in its parent`)
  const position = placement.side === 'after' ? at + 1 : at
  if (siblings.indexOf(draggedId) === position) return null
  return { op: 'move', id: draggedId, parentId: placement.parentId, position }
}
