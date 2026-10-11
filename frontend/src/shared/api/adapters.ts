import { DEFAULT_ICONS } from '../models'
import type { Item, ItemType, NoteContent } from '../models'

export function mapBackendItem(i: any): Item {
  const type: ItemType = i.type === 'folder' ? 'folder' : 'note'
  return {
    id: i.id,
    type,
    name: i.name,
    parentId: i.parent_id || null,
    icon: i.icon || DEFAULT_ICONS[type],
    isFavorite: i.is_favorite ?? false,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  }
}

export function mapBackendNoteContent(c: any): NoteContent {
  return {
    itemId: c.item_id,
    content: c.content ?? '',
    updatedAt: c.updated_at,
  }
}

export interface CreateItemInput {
  id?: string
  type: ItemType
  name: string
  parentId?: string | null
  icon?: string
  isFavorite?: boolean
  content?: string
}

export type ItemPatch = Partial<Pick<Item, 'name' | 'icon' | 'isFavorite'>>

export interface ItemMove {
  id: string
  parentId: string | null
}

export function toBackendCreateItem(i: CreateItemInput): any {
  const payload: any = {
    type: i.type,
    name: i.name,
    parent_id: i.parentId ?? null,
  }
  if (i.id !== undefined) payload.id = i.id
  if (i.icon !== undefined) payload.icon = i.icon
  if (i.isFavorite !== undefined) payload.is_favorite = i.isFavorite
  if (i.content !== undefined) payload.content = i.content
  return payload
}

export function toBackendItemPatch(p: ItemPatch): any {
  const payload: any = {}
  if (p.name !== undefined) payload.name = p.name
  if (p.icon !== undefined) payload.icon = p.icon
  if (p.isFavorite !== undefined) payload.is_favorite = p.isFavorite
  return payload
}

export function toBackendMoves(moves: ItemMove[]): any {
  return { items: moves.map((m) => ({ id: m.id, parent_id: m.parentId })) }
}
