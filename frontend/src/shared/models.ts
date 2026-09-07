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

export interface Folder {
  id: string
  name: string
  parentId: string | null // Points to another Folder's id, or null for root
  icon?: string // e.g., "📁", "🚀"
  isExpanded?: boolean // Local state for sidebar visibility
  createdAt?: string // RFC3339 timestamp from the backend
  updatedAt?: string // RFC3339 timestamp from the backend
}

export interface Note {
  id: string
  title: string
  content: string
  parentId: string | null // Points to a Folder's id, or null for root
  isFavorite?: boolean
  icon?: string // e.g., "📄"
  path?: string[]
  createdAt?: string // RFC3339 timestamp from the backend
  updatedAt?: string // RFC3339 timestamp from the backend
}
