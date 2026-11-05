// Types for the item tree served by /items/:id, /pages and /ops. Everything is an
// item: the hidden workspace root, pages, and BlockNote blocks inside pages.

export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'quote',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]
export type ItemType = 'workspace' | 'page' | BlockType

export const isBlockType = (t: string): t is BlockType =>
  (BLOCK_TYPES as readonly string[]).includes(t)

// Props are an item's key-value properties, with the keys as the server stores them
// (snake_case for the ones it defines, BlockNote's names for the rest). Which keys
// matter depends on the type; see props.ts.
export type Props = Record<string, unknown>

export interface Item {
  id: string
  type: ItemType
  // The direct parent: the workspace, a page, or a block.
  parentId: string | null
  // The nearest page above the item. Only /pages fills it in; null elsewhere and
  // for top-level pages.
  parentPageId: string | null
  // Children that are not in the trash, in order.
  childIds: string[]
  props: Props
  trashedAt: string | null
  createdAt: string
  updatedAt: string
}

// OpenedItem is what GET /items/:id returns: a page ready for the editor.
export interface OpenedItem {
  // The page, then everything under it in document order. Child pages are
  // included, but not what is inside them.
  items: Item[]
  // The pages above it, top-level page first.
  ancestors: Item[]
  // Set when the requested id was a block, so the editor can scroll to it.
  focusId: string | null
  inTrash: boolean
}

// Op is one change in a POST /ops batch. position is an index into the parent's
// childIds when the op runs, not counting the item itself; without it the item
// goes at the end (a page added to the end of a page goes before its trailing
// empty paragraph).
export type Op =
  | {
      op: 'create'
      id: string
      type: Exclude<ItemType, 'workspace'>
      parentId: string
      position?: number
      props?: Props
    }
  | {
      op: 'update'
      id: string
      type?: Exclude<ItemType, 'workspace'>
      props?: Props
    }
  | { op: 'move'; id: string; parentId: string; position?: number }
  | { op: 'delete'; id: string }
  | { op: 'trash'; id: string }
  // Takes a page out of the trash, to parentId at position, or to the end of
  // the top level without parentId.
  | { op: 'restore'; id: string; parentId?: string; position?: number }

export const MAX_OPS_PER_BATCH = 500

// A page in the trash, and when it will be removed for good.
export interface TrashedPage {
  page: Item
  purgeAt: string
}
