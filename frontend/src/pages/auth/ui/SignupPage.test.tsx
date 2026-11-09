import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import { sessionQuery } from '#/shared/hooks/useSession'
import { SignupPage } from './SignupPage'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

function renderSignupPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <SignupPage />
    </QueryClientProvider>,
  )
  return queryClient
}

function submitSignupForm(
  overrides: {
    username?: string
    email?: string
    password?: string
  } = {},
) {
  fireEvent.change(screen.getByLabelText(/username/i), {
    target: { value: overrides.username ?? 'bob' },
  })
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: overrides.email ?? 'bob@example.com' },
  })
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: overrides.password ?? 'secret123' },
  })
  fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
}

describe('SignupPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('signs up, records the session and navigates to /items', async () => {
    const queryClient = renderSignupPage()
    submitSignupForm()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/items' })
    })
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toMatchObject({
      username: 'bob',
      email: 'bob@example.com',
    })
  })

  it('shows a duplicate-email message on a 409 response', async () => {
    server.use(
      http.post('/api/v1/auth/signup', () =>
        HttpResponse.json(
          { error: 'the email already exists' },
          { status: 409 },
        ),
      ),
    )
    renderSignupPage()
    submitSignupForm()

    await waitFor(() => {
      expect(
        screen.getByText('An account with this email already exists.'),
      ).toBeDefined()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows an invalid-email message on a 422 response', async () => {
    server.use(
      http.post('/api/v1/auth/signup', () =>
        HttpResponse.json(
          { error: 'the email address appears to be invalid or undeliverable' },
          { status: 422 },
        ),
      ),
    )
    renderSignupPage()
    submitSignupForm()

    await waitFor(() => {
      expect(
        screen.getByText('The email address looks invalid or undeliverable.'),
      ).toBeDefined()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a generic message on a 500 response', async () => {
    server.use(
      http.post('/api/v1/auth/signup', () =>
        HttpResponse.json({ error: 'internal server error' }, { status: 500 }),
      ),
    )
    renderSignupPage()
    submitSignupForm()

    await waitFor(() => {
      expect(
        screen.getByText(
          'Something went wrong on our end. Please try again shortly.',
        ),
      ).toBeDefined()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
