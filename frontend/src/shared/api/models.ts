export interface User {
  id: string
  username: string
  email: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
}
