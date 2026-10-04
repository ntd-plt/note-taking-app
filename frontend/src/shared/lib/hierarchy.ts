import type { Folder, Note } from '../models'

export type ItemType = 'note' | 'folder'

export interface ItemRef {
  id: string
  type: ItemType
}

export interface SelectionSplit {
  /** Selected items with no selected ancestor folder: they keep their id and move. */
  moved: ItemRef[]
  /** Selected items inside another selected folder: the server clones them. */
  cloned: ItemRef[]
}

/** True when a selected folder strictly contains an item whose parent is `parentId`. */
function hasSelectedAncestor(
  parentId: string | null,
  selectedFolderIds: Set<string>,
  parentOf: Map<string, string | null>,
): boolean {
  const visited = new Set<string>()
  let current = parentId
  while (current !== null && !visited.has(current)) {
    if (selectedFolderIds.has(current)) return true
    visited.add(current)
    current = parentOf.get(current) ?? null
  }
  return false
}

/**
 * Splits a selection into moved and cloned items. Mirrors the server rule, so the
 * UI can predict what a drop will do before the request returns.
 */
export function splitSelection(
  selection: ItemRef[],
  folders: Folder[],
  notes: Note[],
): SelectionSplit {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))
  const noteParent = new Map(notes.map((n) => [n.id, n.parentId]))
  const selectedFolderIds = new Set(
    selection.filter((i) => i.type === 'folder').map((i) => i.id),
  )

  const split: SelectionSplit = { moved: [], cloned: [] }
  const seen = new Set<string>()
  for (const item of selection) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const parentId =
      item.type === 'folder'
        ? (parentOf.get(item.id) ?? null)
        : (noteParent.get(item.id) ?? null)
    const nested = hasSelectedAncestor(parentId, selectedFolderIds, parentOf)
    ;(nested ? split.cloned : split.moved).push(item)
  }
  return split
}

/**
 * Folders that can never be a drop target for this selection: every selected
 * folder and all of its descendants.
 */
export function getInvalidDropTargetIds(
  selection: ItemRef[],
  folders: Folder[],
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (f.parentId === null) continue
    childrenOf.set(f.parentId, [...(childrenOf.get(f.parentId) ?? []), f.id])
  }

  const invalid = new Set<string>()
  const stack = selection.filter((i) => i.type === 'folder').map((i) => i.id)
  while (stack.length > 0) {
    const id = stack.pop()!
    if (invalid.has(id)) continue
    invalid.add(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }
  return invalid
}

/** True when dropping would change nothing: every item already lives in the destination. */
export function isNoopMove(
  selection: ItemRef[],
  destinationId: string | null,
  folders: Folder[],
  notes: Note[],
): boolean {
  const { moved, cloned } = splitSelection(selection, folders, notes)
  if (cloned.length > 0) return false
  const parentById = new Map<string, string | null>([
    ...folders.map((f) => [f.id, f.parentId] as const),
    ...notes.map((n) => [n.id, n.parentId] as const),
  ])
  return moved.every((i) => (parentById.get(i.id) ?? null) === destinationId)
}

const COPY_SUFFIX = /^(.*) \(Copy \d+\)$/

/** Picks the smallest unused "Name (Copy N)" and records it in `taken`. */
export function nextCloneName(name: string, taken: Set<string>): string {
  const match = COPY_SUFFIX.exec(name)
  const base = match && match[1] !== '' ? match[1] : name
  for (let n = 1; ; n++) {
    const suffix = ` (Copy ${n})`
    const room = 255 - [...suffix].length
    const trimmed = [...base].slice(0, room).join('')
    const candidate = `${trimmed}${suffix}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}
