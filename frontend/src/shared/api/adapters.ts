import type { Note, Folder } from '../models'

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
    isFavorite: n.isFavorite || false,
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
  return payload
}
