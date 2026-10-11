// src/entities/user/api/user.handlers.ts
import { http, HttpResponse } from 'msw'
import { mockState } from '#/mocks/state'

export const userHandlers = [
  http.get('https://api.example.com/user', () => {
    return HttpResponse.json({
      id: 'abc-123',
      firstName: 'John',
      lastName: 'Maverick',
    })
  }),

  http.get('/api/me', () => {
    return HttpResponse.json(mockState.currentUser)
  }),

  // password hash, in snake_case like the real API).
  http.get('/api/v1/users/me', () => {
    const user = mockState.currentUser
    if (!user) {
      return HttpResponse.json({ error: 'user not found' }, { status: 404 })
    }
    const now = new Date().toISOString()
    return HttpResponse.json({
      id: user.id,
      name: user.username,
      email: user.email,
      created_at: now,
      updated_at: now,
    })
  }),
]
