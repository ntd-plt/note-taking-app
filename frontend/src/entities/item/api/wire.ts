// The JSON shapes of the item endpoints, and conversions to and from the client
// types. Field names are mapped by hand: props must keep their keys exactly.
import type {
  Item,
  ItemType,
  OpenedItem,
  Op,
  Props,
  TrashedPage,
} from '../model/types'

export interface WireItem {
  id: string
  user_id?: string
  parent_id: string | null
  parent_page_id?: string | null
  type: ItemType
  child_ids: string[] | null
  props: Props | null
  trashed_at?: string | null
  created_at: string
  updated_at: string
}

export interface WireOpenedItem {
  items: WireItem[]
  ancestors: WireItem[]
  focus_id: string | null
  in_trash: boolean
}

export interface WireTrash {
  pages: (WireItem & { purge_at: string })[]
}

export interface WireOp {
  op: Op['op']
  id: string
  type?: string
  parent_id?: string
  position?: number
  props?: Props
}

export function fromWireItem(w: WireItem): Item {
  return {
    id: w.id,
    type: w.type,
    parentId: w.parent_id ?? null,
    parentPageId: w.parent_page_id ?? null,
    childIds: w.child_ids ?? [],
    props: w.props ?? {},
    trashedAt: w.trashed_at ?? null,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }
}

export function fromWireOpenedItem(w: WireOpenedItem): OpenedItem {
  return {
    items: w.items.map(fromWireItem),
    ancestors: w.ancestors.map(fromWireItem),
    focusId: w.focus_id ?? null,
    inTrash: w.in_trash,
  }
}

export const fromWireTrash = (w: WireTrash): TrashedPage[] =>
  w.pages.map(({ purge_at, ...page }) => ({
    page: fromWireItem(page),
    purgeAt: purge_at,
  }))

export function toWireOp(op: Op): WireOp {
  const out: WireOp = { op: op.op, id: op.id }
  if ('type' in op && op.type !== undefined) out.type = op.type
  if ('parentId' in op && op.parentId !== undefined) out.parent_id = op.parentId
  if ('position' in op && op.position !== undefined) out.position = op.position
  if ('props' in op && op.props !== undefined) out.props = op.props
  return out
}
