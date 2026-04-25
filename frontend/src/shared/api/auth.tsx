import type { AuthState } from './models'

export async function validateSession(): Promise<AuthState> {
  try {
    if (true) {
      return {
        user: {
          id: '123',
          username: 'Tung Phan',
          email: 'tung@example.com',
        },
        isAuthenticated: true,
      }
    } else {
      const response = await fetch('/api/auth/validate')
      const data = await response.json()

      if (data.authenticated && data.user) {
        return {
          user: data.user,
          isAuthenticated: data.authenticated,
        }
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
