export interface User {
  id: string
  username: string
  email: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
}

export interface LoginCredentials {
  email: string;
  password?: string; // Optional if we support OAuth/other forms, but typically required
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
