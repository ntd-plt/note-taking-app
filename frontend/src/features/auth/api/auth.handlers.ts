// src/features/auth/api/auth.handlers.ts
// The backend keeps the session in an HttpOnly cookie; the mocks keep the
// logged-in user in mockState instead, and answer with the user as the API does.
import { http, HttpResponse } from 'msw'
import { mockState } from '#/mocks/state'
import type { User } from '#/shared/models'

const userJSON = (user: User) => {
  const now = new Date().toISOString()
  return {
    id: user.id,
    name: user.username,
    email: user.email,
    created_at: now,
    updated_at: now,
  }
}

export const authHandlers = [
  http.post('/api/v1/auth/login', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }
    if (email.includes('error')) {
      return HttpResponse.json(
        { error: 'wrong email or password' },
        { status: 401 },
      )
    }
    mockState.currentUser = {
      id: '123',
      username: email.split('@')[0],
      email,
    }
    return HttpResponse.json(userJSON(mockState.currentUser))
  }),

  http.post('/api/v1/auth/signup', async ({ request }) => {
    const { name, email } = (await request.json()) as {
      name: string
      email: string
    }
    mockState.currentUser = { id: '123', username: name, email }
    return HttpResponse.json(userJSON(mockState.currentUser), { status: 201 })
  }),

  http.post('/api/v1/auth/logout', () => {
    mockState.currentUser = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/v1/auth/logout-all', () => {
    if (!mockState.currentUser) {
      return HttpResponse.json({ error: 'not logged in' }, { status: 401 })
    }
    mockState.currentUser = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/users/me', () => {
    if (!mockState.currentUser) {
      return HttpResponse.json({ error: 'not logged in' }, { status: 401 })
    }
    return HttpResponse.json(userJSON(mockState.currentUser))
  }),
]
