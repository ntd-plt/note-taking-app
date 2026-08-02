import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import { RegisterPage } from './RegisterPage'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

// jsdom's `localStorage` is undefined in this project's vitest environment
// (a pre-existing Node/jsdom version mismatch, unrelated to this feature) —
// register()/login() read/write it directly, so stub it for these tests.
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: () => null,
    length: 0,
  }
}

function renderRegisterPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RegisterPage />
    </QueryClientProvider>,
  )
}

function submitRegisterForm(
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

describe('RegisterPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers successfully and navigates to /notes', async () => {
    renderRegisterPage()
    submitRegisterForm()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/notes' })
    })
  })

  it('shows a duplicate-email message on a 409 response', async () => {
    server.use(
      http.post('/auth/signup', () =>
        HttpResponse.json(
          { error: 'the email already exists' },
          { status: 409 },
        ),
      ),
    )
    renderRegisterPage()
    submitRegisterForm()

    await waitFor(() => {
      expect(
        screen.getByText('An account with this email already exists.'),
      ).toBeDefined()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows an invalid-email message on a 422 response', async () => {
    server.use(
      http.post('/auth/signup', () =>
        HttpResponse.json(
          { error: 'the email address appears to be invalid or undeliverable' },
          { status: 422 },
        ),
      ),
    )
    renderRegisterPage()
    submitRegisterForm()

    await waitFor(() => {
      expect(
        screen.getByText('The email address looks invalid or undeliverable.'),
      ).toBeDefined()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a generic message on a 500 response', async () => {
    server.use(
      http.post('/auth/signup', () =>
        HttpResponse.json({ error: 'internal server error' }, { status: 500 }),
      ),
    )
    renderRegisterPage()
    submitRegisterForm()

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
