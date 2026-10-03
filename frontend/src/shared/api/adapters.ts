import type { Note, Folder } from '../models'
import type { ItemRef } from '../lib/hierarchy'

export function mapBackendFolder(f: any): Folder {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parent_folder_id || null,
    icon: f.icon || '📁',
    isExpanded: f.isExpanded || false,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }
}

export function mapBackendNote(n: any): Note {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    parentId: n.folder_id || null,
    isFavorite: n.is_favorite ?? false,
    icon: n.icon || '📄',
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }
}

export function toBackendFolder(f: Partial<Folder>): any {
  const payload: any = {}
  if (f.name !== undefined) payload.name = f.name
  if (f.parentId !== undefined) payload.parent_folder_id = f.parentId
  return payload
}

export function toBackendNote(n: Partial<Note>): any {
  const payload: any = {}
  if (n.title !== undefined) payload.title = n.title
  if (n.content !== undefined) payload.content = n.content
  if (n.parentId !== undefined) payload.folder_id = n.parentId
  if (n.isFavorite !== undefined) payload.is_favorite = n.isFavorite
  if (n.icon !== undefined) payload.icon = n.icon
  return payload
}

export interface MoveResult {
  moved: { folders: Folder[]; notes: Note[] }
  created: { folders: Folder[]; notes: Note[] }
}

export function toBackendMoveRequest(
  items: ItemRef[],
  destinationId: string | null,
): any {
  return {
    items: items.map(({ id, type }) => ({ id, type })),
    destination_folder_id: destinationId,
  }
}

export function toBackendDuplicateRequest(items: ItemRef[]): any {
  return { items: items.map(({ id, type }) => ({ id, type })) }
}

export function mapBackendMoveResult(r: any): MoveResult {
  return {
    moved: {
      folders: (r.moved?.folders ?? []).map(mapBackendFolder),
      notes: (r.moved?.notes ?? []).map(mapBackendNote),
    },
    created: {
      folders: (r.created?.folders ?? []).map(mapBackendFolder),
      notes: (r.created?.notes ?? []).map(mapBackendNote),
    },
  }
}
