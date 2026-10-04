import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: null }),
}))

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

const rowOf = (text: string) => {
  const row = screen
    .getAllByText(text)
    .map((el) => el.closest('.group'))
    .find((el): el is Element => el !== null)
  if (!row) throw new Error(`Row not found: ${text}`)
  return row
}

describe('Sidebar folder duplicate', () => {
  it('offers Duplicate in the folder menu and shows the numbered copy', async () => {
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
    expect(screen.queryByText('Work (Copy 1)')).toBeNull()

    // Radix opens the menu on pointer down.
    const trigger = rowOf('Work').querySelector(
      'button[title="Folder actions"]',
    )
    if (!trigger) throw new Error('Folder actions button not found')
    fireEvent.pointerDown(trigger, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    await waitFor(() =>
      expect(screen.queryByText('Work (Copy 1)')).not.toBeNull(),
    )
    // The original stays where it was.
    expect(screen.queryByText('Work')).not.toBeNull()
  })
})
