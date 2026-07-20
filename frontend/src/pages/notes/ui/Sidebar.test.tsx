import * as React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import { vi, describe, it, expect } from 'vitest'

const mockNavigate = vi.fn()
// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ noteId: null }),
}))

// Helper to render Sidebar inside necessary context providers
function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

describe('Sidebar Component', () => {
  it('should render folder list and note items successfully', async () => {
    renderSidebar()

    // Wait for the mock folders/notes to be fetched and rendered
    await waitFor(() => {
      // "Getting Started" note is part of the seeded mock data (from initialNotes)
      expect(screen.queryAllByText(/Getting Started/i).length).toBeGreaterThan(
        0,
      )
    })
  })

  it('should toggle folder expansion when chevron is clicked', async () => {
    renderSidebar()

    // Wait for "Work" folder to render
    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeNull()
    })

    // Initially, "Nested Subfolder" is nested inside "Work"
    // By default, since "Work" is not in expandedFolders state initially, it will be collapsed
    expect(screen.queryByText('Nested Subfolder')).toBeNull()

    // Find the toggle button inside the "Work" folder item
    const workFolder = screen.getByText('Work').closest('.group')
    const chevronButton = workFolder?.querySelector('button')
    if (!chevronButton) throw new Error('Chevron button not found')

    // Click to expand
    fireEvent.click(chevronButton)

    // Wait for "Nested Subfolder" to appear (meaning the folder expanded!)
    await waitFor(() => {
      expect(screen.queryByText('Nested Subfolder')).not.toBeNull()
    })

    // Click to collapse again
    fireEvent.click(chevronButton)

    // Verify it disappears (collapsed!)
    await waitFor(() => {
      expect(screen.queryByText('Nested Subfolder')).toBeNull()
    })
  })

  it('should handle folder cycles gracefully without infinite loop or crash', async () => {
    const { server } = await import('#/mocks/server')
    const { http, HttpResponse } = await import('msw')

    // Intercept GET /api/folders to return a cycle (A -> B -> A)
    server.use(
      http.get('/api/folders', () => {
        return HttpResponse.json([
          {
            id: 'folder-a',
            name: 'Folder A',
            parent_folder_id: 'folder-b',
            icon: '📁',
            isExpanded: true,
          },
          {
            id: 'folder-b',
            name: 'Folder B',
            parent_folder_id: 'folder-a',
            icon: '📁',
            isExpanded: true,
          },
        ])
      }),
      http.get('/api/notes', () => {
        return HttpResponse.json([])
      }),
    )

    renderSidebar()

    // It should not freeze/stack overflow.
    // If it survives rendering without exceeding maximum call stack size, the test passes.
    await waitFor(() => {
      expect(screen.queryByText('Folder A')).toBeNull() // Since they form a cycle and can't reach root, they are not rendered.
    })
  })

  it('should call logout and redirect to /login when clicking Log Out', async () => {
    // Set mock user in localStorage so we simulate being logged in.
    // The token is structured as a valid base64url payload with a far-future expiry.
    localStorage.setItem(
      'auth_token',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIiwiZXhwIjoyNTE2MjM5MDAwfQ.sig',
    )
    localStorage.setItem(
      'user_profile',
      JSON.stringify({
        id: '123',
        username: 'Lam Tung',
        email: 'ltp@example.com',
      }),
    )

    renderSidebar()

    // Find the profile trigger button (displays user's initials/name)
    // Wait for the UI to update with "Lam Tung"
    await waitFor(() => {
      expect(screen.queryByText(/Lam Tung/i)).not.toBeNull()
    })

    const profileBtn = screen.getByText(/Lam Tung/i)
    const triggerBtn = profileBtn.closest('button')
    if (!triggerBtn) throw new Error('Trigger button not found')

    // Click profile dropdown trigger using pointer and click events (Radix UI requirement)
    fireEvent.pointerDown(triggerBtn, { ctrlKey: false, button: 0 })
    fireEvent.pointerUp(triggerBtn, { ctrlKey: false, button: 0 })
    fireEvent.click(triggerBtn)

    // Wait for "Log Out" dropdown item to appear
    await waitFor(() => {
      expect(screen.queryByText('Log Out')).not.toBeNull()
    })

    const logoutBtn = screen.getByText('Log Out')

    // Click Log Out
    fireEvent.click(logoutBtn)

    // Wait for localStorage to be cleared and navigate called
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBeNull()
      expect(localStorage.getItem('user_profile')).toBeNull()
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' })
    })
  })
})
