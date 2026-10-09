import type { Item, NoteContent } from '#/shared/models'
import {
  mapBackendItem,
  mapBackendNoteContent,
  toBackendCreateItem,
  toBackendItemPatch,
  toBackendMoves,
} from '#/shared/api'
import type { CreateItemInput, ItemMove, ItemPatch } from '#/shared/api'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const API = '/api/v1'

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

export const fetchItems = async (): Promise<Item[]> => {
  const data = await request<any[]>(`${API}/items`, { method: 'GET' })
  return data.map(mapBackendItem)
}

export const fetchItem = async (id: string): Promise<Item> => {
  const data = await request<any>(`${API}/items/${id}`, { method: 'GET' })
  return mapBackendItem(data)
}

export const createItem = async (input: CreateItemInput): Promise<Item> => {
  const data = await request<any>(`${API}/items`, {
    method: 'POST',
    body: JSON.stringify(toBackendCreateItem(input)),
  })
  return mapBackendItem(data)
}

export const updateItem = async (
  id: string,
  updates: ItemPatch,
): Promise<Item> => {
  const data = await request<any>(`${API}/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toBackendItemPatch(updates)),
  })
  return mapBackendItem(data)
}

export const deleteItem = async (id: string): Promise<void> => {
  await request<void>(`${API}/items/${id}`, { method: 'DELETE' })
}

export const moveItems = async (moves: ItemMove[]): Promise<Item[]> => {
  const data = await request<any[]>(`${API}/items`, {
    method: 'PATCH',
    body: JSON.stringify(toBackendMoves(moves)),
  })
  return data.map(mapBackendItem)
}

export const duplicateItem = async (id: string): Promise<Item> => {
  const data = await request<any>(
    `${API}/items?cloneFromId=${encodeURIComponent(id)}`,
    { method: 'POST' },
  )
  return mapBackendItem(data)
}

export const fetchNoteContent = async (id: string): Promise<NoteContent> => {
  const data = await request<any>(`${API}/items/${id}/content`, {
    method: 'GET',
  })
  return mapBackendNoteContent(data)
}

export const saveNoteContent = async (
  id: string,
  content: string,
): Promise<NoteContent> => {
  const data = await request<any>(`${API}/items/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
  return mapBackendNoteContent(data)
}
