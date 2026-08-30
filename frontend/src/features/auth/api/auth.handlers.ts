// src/features/auth/api/auth.handlers.ts
import { http, HttpResponse } from 'msw'
import { mockState } from '#/mocks/state'

export const authHandlers = [
  http.get('/api/auth/validate', () => {
    const response = mockState.currentUser
      ? {
          authenticated: true,
          user: {
            id: '123',
            username: 'Tung Phan',
            email: 'tung@example.com',
          },
        }
      : {
          authenticated: false,
          user: null,
        }
    return HttpResponse.json(response)
  }),

  http.post('/auth/login', async ({ request }) => {
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
      email: email,
    }
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    })
  }),

  http.post('/auth/signup', async () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    })
  }),
]
