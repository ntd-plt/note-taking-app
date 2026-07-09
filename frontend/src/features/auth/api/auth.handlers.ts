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

  http.post('/api/auth/login', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }
    if (email.includes('error')) {
      return HttpResponse.json(
        { message: 'Invalid credentials' },
        { status: 401 },
      )
    }

    const user = {
      id: '123',
      username: email.split('@')[0],
      email: email,
    }
    mockState.currentUser = user
    return HttpResponse.json({
      token: 'mock-jwt-token-12345',
      user,
    })
  }),

  http.post('/api/auth/register', async ({ request }) => {
    const { username, email } = (await request.json()) as any
    return HttpResponse.json({
      token: 'mock-jwt-token-12345',
      user: {
        id: '123',
        username: username,
        email: email,
      },
    })
  }),
]
