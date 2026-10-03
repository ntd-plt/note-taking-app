import type { Folder, Note } from './model'
import {
  mapBackendFolder,
  mapBackendNote,
  mapBackendMoveResult,
  toBackendDuplicateRequest,
  toBackendFolder,
  toBackendMoveRequest,
  toBackendNote,
} from '#/shared/api'
import type { MoveResult } from '#/shared/api'
import type { ItemRef } from '#/shared/lib/hierarchy'

const BASE_URL = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = localStorage.getItem('auth_token')
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = null
    }
    // The Go backend reports failures as {"error": "..."}; other callers use "message".
    throw new Error(
      errorData?.message ||
        errorData?.error ||
        `HTTP error! Status: ${response.status}`,
    )
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

// Folders API
export const fetchFolders = async (): Promise<Folder[]> => {
  const data = await request<any[]>('/api/folders', { method: 'GET' })
  return data.map(mapBackendFolder)
}

export const fetchFolder = async (id: string): Promise<Folder> => {
  const data = await request<any>(`/api/folders/${id}`, { method: 'GET' })
  return mapBackendFolder(data)
}

export const createFolder = async (
  folder: Partial<Folder>,
): Promise<Folder> => {
  const body = toBackendFolder(folder)
  const data = await request<any>('/api/folders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return mapBackendFolder(data)
}

export const updateFolder = async (
  id: string,
  updates: Partial<Folder>,
): Promise<Folder> => {
  const body = {
    folders: [
      {
        id,
        ...toBackendFolder(updates),
      },
    ],
  }
  const data = await request<any[]>('/api/folders', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return mapBackendFolder(data[0])
}

export const deleteFolder = async (id: string): Promise<void> => {
  const payload = { ids: [id] }
  await request<void>('/api/folders', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

// Notes API
export const fetchNotes = async (): Promise<Note[]> => {
  const data = await request<any[]>('/api/notes', { method: 'GET' })
  return data.map(mapBackendNote)
}

export const fetchNote = async (id: string): Promise<Note> => {
  const data = await request<any>(`/api/notes/${id}`, { method: 'GET' })
  return mapBackendNote(data)
}

export const createNote = async (note: Partial<Note>): Promise<Note> => {
  const body = toBackendNote(note)
  const data = await request<any>('/api/notes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return mapBackendNote(data)
}

export const updateNote = async (
  id: string,
  updates: Partial<Note>,
): Promise<Note> => {
  const body = {
    notes: [
      {
        id,
        ...toBackendNote(updates),
      },
    ],
  }
  const data = await request<any[]>('/api/notes', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return mapBackendNote(data[0])
}

export const deleteNote = async (id: string): Promise<void> => {
  const payload = { ids: [id] }
  await request<void>('/api/notes', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

// Hierarchy API
export const moveItems = async (
  items: ItemRef[],
  destinationId: string | null,
): Promise<MoveResult> => {
  const data = await request<any>('/api/hierarchy/move', {
    method: 'POST',
    body: JSON.stringify(toBackendMoveRequest(items, destinationId)),
  })
  return mapBackendMoveResult(data)
}

// Copies the items next to the originals with "(Copy N)" names; folders are copied
// recursively. The same server-side clone logic that moves use.
export const duplicateItems = async (items: ItemRef[]): Promise<MoveResult> => {
  const data = await request<any>('/api/hierarchy/duplicate', {
    method: 'POST',
    body: JSON.stringify(toBackendDuplicateRequest(items)),
  })
  return mapBackendMoveResult(data)
}
