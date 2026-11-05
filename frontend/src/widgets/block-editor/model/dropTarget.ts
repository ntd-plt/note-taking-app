// dropTarget decides where a block dragged by its ⋮⋮ handle would land, from the
// pointer position and the layout of the visible blocks. It holds no DOM code: the
// drag layer measures each block's own line (not its children) into a BlockRow.
//
// - Middle of a block: becomes that block's last child.
// - Middle of a child page block: goes to the end of that page.
// - Bottom EDGE px of a block, or top EDGE px of the next one (above the first
//   block: the gap below the title): goes into that gap. The pointer's x picks the
//   nesting level, from the first-child level of the block above down through its
//   ancestors for as long as each is a last child (as Notion does). The block lands
//   right after the block above it at that level, or first in it at the
//   first-child level.
// - The dragged block, its descendants and drops that change nothing: null.

export interface BlockRow {
  id: string
  // null for a top-level block.
  parentId: string | null
  depth: number
  top: number
  bottom: number
  isPage: boolean
}

export interface DropGeometry {
  // Visible rows in document order. Children of a collapsed toggle are left out.
  rows: BlockRow[]
  // Width of one nesting level, and the x where level 0 starts.
  indent: number
  originX: number
  edge?: number
}

export type EditorDrop =
  // Append as the last child of targetId; highlight it, line at its child indent.
  | { kind: 'nest'; targetId: string }
  // Move to the end of a child page's content.
  | { kind: 'page'; pageId: string }
  // Place in parentId (null: top level) right after afterId (null: first).
  // Draw the line below lineBelowId (null: below the title) at `level`, and
  // highlight parentId if set.
  | {
      kind: 'gap'
      parentId: string | null
      afterId: string | null
      level: number
      lineBelowId: string | null
    }

export const DROP_EDGE = 6

export function dropTarget(
  draggedId: string,
  pointer: { x: number; y: number },
  geo: DropGeometry,
): EditorDrop | null {
  const { rows } = geo
  const edge = geo.edge ?? DROP_EDGE
  const byId = new Map(rows.map((r) => [r.id, r]))
  const inDragged = (id: string | null) => {
    for (let r = id === null ? undefined : byId.get(id); r; ) {
      if (r.id === draggedId) return true
      r = r.parentId === null ? undefined : byId.get(r.parentId)
    }
    return false
  }

  // Find the row under the pointer, or the gap it is in: gapBelow is the index of
  // the row above the gap, -1 for the gap below the title.
  let gapBelow = rows.length - 1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (pointer.y < r.top) {
      gapBelow = i - 1
      break
    }
    if (pointer.y > r.bottom) continue
    if (pointer.y < r.top + edge) gapBelow = i - 1
    else if (pointer.y > r.bottom - edge) gapBelow = i
    else {
      if (inDragged(r.id)) return null
      return r.isPage
        ? { kind: 'page', pageId: r.id }
        : { kind: 'nest', targetId: r.id }
    }
    break
  }

  let drop: EditorDrop
  if (gapBelow < 0) {
    drop = {
      kind: 'gap',
      parentId: null,
      afterId: null,
      level: 0,
      lineBelowId: null,
    }
  } else {
    const above = rows[gapBelow]
    const below = rows.at(gapBelow + 1)
    const max = above.isPage ? above.depth : above.depth + 1
    const min = Math.min(below ? below.depth : 0, max)
    const wanted = Math.floor((pointer.x - geo.originX) / geo.indent)
    const level = Math.max(min, Math.min(max, wanted))
    if (level > above.depth) {
      drop = {
        kind: 'gap',
        parentId: above.id,
        afterId: null,
        level,
        lineBelowId: above.id,
      }
    } else {
      let anchor = above
      while (anchor.depth > level) anchor = byId.get(anchor.parentId!)!
      drop = {
        kind: 'gap',
        parentId: anchor.parentId,
        afterId: anchor.id,
        level,
        lineBelowId: above.id,
      }
    }
  }

  if (inDragged(drop.parentId)) return null
  const dragged = byId.get(draggedId)
  if (dragged && drop.parentId === dragged.parentId) {
    const before = previousSibling(rows, dragged)
    if (drop.afterId === draggedId || drop.afterId === before) return null
  }
  return drop
}

function previousSibling(rows: BlockRow[], r: BlockRow): string | null {
  const i = rows.indexOf(r)
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].parentId === r.parentId) return rows[j].id
    if (rows[j].depth < r.depth) break
  }
  return null
}
