import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import * as api from '#/widgets/note-editor/api'
import { resetMockItems } from '#/mocks/items.handlers'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ itemId: null }),
}))

afterEach(() => {
  resetMockItems()
  mockNavigate.mockClear()
})

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

// Radix opens the menu on pointer down.
function openMenu(row: Element, title: string) {
  const trigger = row.querySelector(`button[title="${title}"]`)
  if (!trigger) throw new Error(`${title} button not found`)
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

describe('Sidebar duplicate', () => {
  it('offers Duplicate in the folder menu and shows the numbered copy', async () => {
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
    expect(screen.queryByText('Work (Copy 1)')).toBeNull()

    openMenu(rowOf('Work'), 'Folder actions')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    await waitFor(() =>
      expect(screen.queryByText('Work (Copy 1)')).not.toBeNull(),
    )
    // The original stays where it was.
    expect(screen.queryByText('Work')).not.toBeNull()
  })

  it('copies the whole folder, keeping the names of its contents', async () => {
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())

    openMenu(rowOf('Work'), 'Folder actions')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    await waitFor(async () => {
      const items = await api.fetchItems()
      const copy = items.find((i) => i.name === 'Work (Copy 1)')
      expect(copy).toBeDefined()
      expect(
        items
          .filter((i) => i.parentId === copy!.id)
          .map((i) => i.name)
          .sort(),
      ).toEqual(['Nested Subfolder', 'Q3 Product Roadmap', 'Weekly Team Sync'])
    })
    const items = await api.fetchItems()
    expect(items.filter((i) => i.parentId === 'work-space')).toHaveLength(3)
  })

  it('opens the copy of a note', async () => {
    renderSidebar()
    await waitFor(() =>
      expect(screen.queryAllByText('Getting Started').length).toBeGreaterThan(
        0,
      ),
    )

    openMenu(rowOf('Getting Started'), 'More actions')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    await waitFor(() =>
      expect(screen.queryByText('Getting Started (Copy 1)')).not.toBeNull(),
    )
    const copy = (await api.fetchItems()).find(
      (i) => i.name === 'Getting Started (Copy 1)',
    )!
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/items/$itemId',
      params: { itemId: copy.id },
    })
  })
})
