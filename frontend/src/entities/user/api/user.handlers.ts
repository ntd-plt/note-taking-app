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
]
