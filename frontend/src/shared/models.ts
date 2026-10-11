export interface User {
  id: string
  username: string
  email: string
  createdAt?: string
  updatedAt?: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
}

export interface LoginCredentials {
  email: string
  password?: string // Optional if we support OAuth/other forms, but typically required
}

export interface RegisterCredentials {
  username: string
  email: string
  password?: string
}

export interface AuthResponse {
  token: string
  user: User
}

export type ItemType = 'note' | 'folder'

export interface Item {
  id: string
  type: ItemType
  name: string
  parentId: string | null
  icon: string
  isFavorite: boolean
  createdAt?: string // RFC3339 timestamp from the backend
  updatedAt?: string // RFC3339 timestamp from the backend
}

export interface NoteContent {
  itemId: string
  content: string
  updatedAt?: string
}

export const DEFAULT_ICONS: Record<ItemType, string> = {
  note: '📄',
  folder: '📁',
}
