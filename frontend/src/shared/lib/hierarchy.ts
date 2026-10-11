import type { Item } from '../models'

export function compareItems(a: Item, b: Item): number {
  if ((a.type === 'folder') !== (b.type === 'folder')) {
    return a.type === 'folder' ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

export function sortItems(items: Item[]): Item[] {
  return [...items].sort(compareItems)
}

export function buildChildrenMap(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>()
  for (const item of items) {
    if (item.parentId === null) continue
    const siblings = map.get(item.parentId)
    if (siblings) siblings.push(item)
    else map.set(item.parentId, [item])
  }
  return map
}

export function getSubtreeIds(
  rootIds: Iterable<string>,
  childrenMap: Map<string, Item[]>,
): Set<string> {
  const out = new Set<string>()
  const stack = [...rootIds]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const child of childrenMap.get(id) ?? []) stack.push(child.id)
  }
  return out
}

export function getAncestorIds(
  id: string,
  parentOf: ReadonlyMap<string, string | null>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let current = parentOf.get(id) ?? null
  while (current !== null && !seen.has(current)) {
    out.push(current)
    seen.add(current)
    current = parentOf.get(current) ?? null
  }
  return out
}

export function buildParentMap(items: Item[]): Map<string, string | null> {
  return new Map(items.map((i) => [i.id, i.parentId]))
}

export function getTopLevelMembers(
  selectedIds: ReadonlySet<string>,
  items: Item[],
): Item[] {
  return items.filter(
    (i) =>
      selectedIds.has(i.id) &&
      (i.parentId === null || !selectedIds.has(i.parentId)),
  )
}

export function getInvalidDropTargetIds(
  movedIds: string[],
  items: Item[],
): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const folders = movedIds.filter((id) => byId.get(id)?.type === 'folder')
  return getSubtreeIds(folders, buildChildrenMap(items))
}

/** True when dropping would change nothing: every item already lives in the destination. */
export function isNoopMove(
  movedIds: string[],
  destinationId: string | null,
  items: Item[],
): boolean {
  const parentOf = buildParentMap(items)
  return movedIds.every((id) => (parentOf.get(id) ?? null) === destinationId)
}

export function getItemPath(item: Item, items: Item[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const path: Item[] = []
  const seen = new Set<string>([item.id])
  let parentId = item.parentId
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId)
    if (!parent) break
    path.unshift(parent)
    seen.add(parentId)
    parentId = parent.parentId
  }
  return path
}
