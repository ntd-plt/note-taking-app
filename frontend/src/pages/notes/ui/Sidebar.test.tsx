import * as React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import { vi, describe, it, expect } from 'vitest'

// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
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
    </QueryClientProvider>
  )
}

describe('Sidebar Component', () => {
  it('should render folder list and note items successfully', async () => {
    renderSidebar()

    // Wait for the mock folders/notes to be fetched and rendered
    await waitFor(() => {
      // "Getting Started" note is part of the seeded mock data (from initialNotes)
      expect(screen.queryAllByText(/Getting Started/i).length).toBeGreaterThan(0)
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
})
