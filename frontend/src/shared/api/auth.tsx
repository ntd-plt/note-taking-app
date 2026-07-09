import { apiClient } from './client'
import type {
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
} from '../models'

export async function validateSession(): Promise<AuthState> {
  try {
    const data = await apiClient.get<{ authenticated: boolean; user: any }>(
      '/api/auth/validate',
    )

    if (data.authenticated && data.user) {
      return {
        user: data.user,
        isAuthenticated: data.authenticated,
      }
    }
  } catch (error) {
    console.error('Session validation failed:', error)
  }
  return {
    user: null,
    isAuthenticated: false,
  }
}

export async function login(
  credentials: LoginCredentials,
): Promise<AuthResponse> {
  const data = await apiClient.post<AuthResponse>(
    '/api/auth/login',
    credentials,
  )
  if (data.token) {
    localStorage.setItem('auth_token', data.token)
  }
  return data
}

export async function register(
  credentials: RegisterCredentials,
): Promise<AuthResponse> {
  const data = await apiClient.post<AuthResponse>(
    '/api/auth/register',
    credentials,
  )
  if (data.token) {
    localStorage.setItem('auth_token', data.token)
  }
  return data
}

export async function logout(): Promise<void> {
  localStorage.removeItem('auth_token')
}
