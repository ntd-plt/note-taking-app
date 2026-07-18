import { apiClient } from './client'
import type {
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
} from '../models'

function decodeJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

export async function validateSession(): Promise<AuthState> {
  try {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      return {
        user: null,
        isAuthenticated: false,
      }
    }

    const decoded = decodeJwt(token)
    if (!decoded || (decoded.exp && decoded.exp * 1000 < Date.now())) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_profile')
      return {
        user: null,
        isAuthenticated: false,
      }
    }

    let user = null
    const profileStr = localStorage.getItem('user_profile')
    if (profileStr) {
      try {
        user = JSON.parse(profileStr)
      } catch {}
    }

    if (!user) {
      user = {
        id: decoded.user_id || 'abc-123',
        username: 'user',
        email: 'user@example.com',
      }
      localStorage.setItem('user_profile', JSON.stringify(user))
    }

    return {
      user,
      isAuthenticated: true,
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
  const data = await apiClient.post<{
    accessToken: string
    refreshToken: string
  }>('/auth/login', credentials)
  if (data.accessToken) {
    localStorage.setItem('auth_token', data.accessToken)
    if (data.refreshToken) {
      localStorage.setItem('refresh_token', data.refreshToken)
    }

    const decoded = decodeJwt(data.accessToken)
    const user = {
      id: decoded?.user_id || 'abc-123',
      username: credentials.email.split('@')[0],
      email: credentials.email,
    }
    localStorage.setItem('user_profile', JSON.stringify(user))

    return {
      token: data.accessToken,
      user,
    }
  }
  throw new Error('Login failed')
}

export async function register(
  credentials: RegisterCredentials,
): Promise<AuthResponse> {
  const payload = {
    name: credentials.username,
    email: credentials.email,
    password: credentials.password,
  }
  const data = await apiClient.post<{
    accessToken: string
    refreshToken: string
  }>('/auth/signup', payload)
  if (data.accessToken) {
    localStorage.setItem('auth_token', data.accessToken)
    if (data.refreshToken) {
      localStorage.setItem('refresh_token', data.refreshToken)
    }

    const decoded = decodeJwt(data.accessToken)
    const user = {
      id: decoded?.user_id || 'abc-123',
      username: credentials.username,
      email: credentials.email,
    }
    localStorage.setItem('user_profile', JSON.stringify(user))

    return {
      token: data.accessToken,
      user,
    }
  }
  throw new Error('Registration failed')
}

export async function logout(): Promise<void> {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_profile')
}
