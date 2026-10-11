import type { Item, SidebarItem } from '#/widgets/note-editor/model'
import { compareItems } from '#/shared/lib/hierarchy'

export function buildTree(
  items: Item[],
  expanded: Record<string, boolean>,
): SidebarItem[] {
  const toRow = (item: Item): SidebarItem => ({
    id: item.id,
    type: item.type,
    data: item,
    isExpanded: item.type === 'folder' && !!expanded[item.id],
    children: [],
  })

  const rows = new Map<string, SidebarItem>(items.map((i) => [i.id, toRow(i)]))
  const childrenOf = new Map<string, Item[]>()
  const roots: Item[] = []
  for (const item of items) {
    if (item.parentId === null) {
      roots.push(item)
    } else {
      childrenOf.set(item.parentId, [
        ...(childrenOf.get(item.parentId) ?? []),
        item,
      ])
    }
  }

  const visited = new Set<string>()
  const assemble = (siblings: Item[]): SidebarItem[] =>
    [...siblings].sort(compareItems).flatMap((item) => {
      if (visited.has(item.id)) {
        console.warn('Cycle detected in item tree assembly:', item.id)
        return []
      }
      visited.add(item.id)
      const row = rows.get(item.id)!
      row.children = assemble(childrenOf.get(item.id) ?? [])
      return [row]
    })

  return assemble(roots)
}
