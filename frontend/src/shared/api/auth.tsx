// Login, signup and logout against the backend's session cookie. The browser
// keeps the cookie (HttpOnly, so this code never sees it); who is logged in is
// always asked of the server through GET /users/me.
import { ApiError, apiClient } from './client'
import type { LoginCredentials, SignupCredentials, User } from '../models'

// The user as the API returns it, after the client camelized its keys.
interface UserApiResponse {
  id: string
  name: string
  email: string
  createdAt?: string
  updatedAt?: string
}

const toUser = (data: UserApiResponse): User => ({
  id: data.id,
  username: data.name,
  email: data.email,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
})

// fetchCurrentUser returns the logged-in user, or null when there is no live
// session.
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return toUser(await apiClient.get<UserApiResponse>('/api/v1/users/me'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function login(credentials: LoginCredentials): Promise<User> {
  return toUser(
    await apiClient.post<UserApiResponse>('/api/v1/auth/login', credentials),
  )
}

export async function signup(credentials: SignupCredentials): Promise<User> {
  return toUser(
    await apiClient.post<UserApiResponse>('/api/v1/auth/signup', {
      name: credentials.username,
      email: credentials.email,
      password: credentials.password,
    }),
  )
}

// logout ends this browser's session.
export async function logout(): Promise<void> {
  await apiClient.post<null>('/api/v1/auth/logout')
}

// logoutAll ends every session of the user, on every device.
export async function logoutAll(): Promise<void> {
  await apiClient.post<null>('/api/v1/auth/logout-all')
}
