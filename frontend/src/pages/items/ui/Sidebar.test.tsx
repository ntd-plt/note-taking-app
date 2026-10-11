import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { resetMockItems } from '#/mocks/items.handlers'
import * as api from '#/widgets/note-editor/api'
import { useItemsStore } from '#/widgets/note-editor'

const mockNavigate = vi.fn()
// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ itemId: null }),
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

afterEach(() => resetMockItems())

describe('Sidebar Component', () => {
  it('should render folders and notes from the item list', async () => {
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

    server.use(
      http.get('/api/v1/items', () => {
        return HttpResponse.json([
          {
            id: 'folder-a',
            type: 'folder',
            name: 'Folder A',
            parent_id: 'folder-b',
            icon: '📁',
          },
          {
            id: 'folder-b',
            type: 'folder',
            name: 'Folder B',
            parent_id: 'folder-a',
            icon: '📁',
          },
        ])
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

describe('Sidebar multi-select', () => {
  const rowOf = (text: string) => {
    const row = screen
      .getAllByText(text)
      .map((el) => el.closest('.group'))
      .find((el): el is Element => el !== null)
    if (!row) throw new Error(`Row not found: ${text}`)
    return row
  }
  const isSelected = (text: string) =>
    rowOf(text).getAttribute('data-selected') === 'true'

  async function renderLoaded() {
    renderSidebar()
    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeNull()
      expect(screen.queryAllByText('Getting Started').length).toBeGreaterThan(0)
    })
  }

  it('toggles rows with Ctrl-click without opening them', async () => {
    mockNavigate.mockClear()
    await renderLoaded()

    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    fireEvent.click(rowOf('Getting Started'), { metaKey: true })

    expect(isSelected('Work')).toBe(true)
    expect(isSelected('Getting Started')).toBe(true)
    expect(isSelected('Personal')).toBe(false)
    expect(mockNavigate).not.toHaveBeenCalled()

    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    expect(isSelected('Work')).toBe(false)
    expect(isSelected('Getting Started')).toBe(true)
  })

  it('selects the visible range with Shift-click', async () => {
    await renderLoaded()

    // Visible order at the top level: folders first (alphabetical), then notes.
    fireEvent.click(rowOf('Personal'), { ctrlKey: true })
    fireEvent.click(rowOf('Getting Started'), { shiftKey: true })

    expect(isSelected('Work')).toBe(true)
    expect(isSelected('Personal')).toBe(true)
    expect(isSelected('Getting Started')).toBe(true)
  })

  it('clears the selection on a plain click, which still opens the note', async () => {
    mockNavigate.mockClear()
    await renderLoaded()
    fireEvent.click(rowOf('Work'), { ctrlKey: true })

    fireEvent.click(rowOf('Getting Started'))

    expect(isSelected('Work')).toBe(false)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/items/$itemId',
      params: { itemId: 'getting-started' },
    })
  })

  it('clears the selection on Escape', async () => {
    await renderLoaded()
    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    expect(isSelected('Work')).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(isSelected('Work')).toBe(false))
  })
})

describe('Sidebar folders in the multi-selection', () => {
  const rowOf = (text: string) => {
    const row = screen
      .getAllByText(text)
      .map((el) => el.closest('.group'))
      .find((el): el is Element => el !== null)
    if (!row) throw new Error(`Row not found: ${text}`)
    return row
  }
  const isSelected = (text: string) =>
    rowOf(text).getAttribute('data-selected') === 'true'
  const chevronOf = (text: string) => {
    const button = rowOf(text).querySelector('button')
    if (!button) throw new Error(`Chevron not found: ${text}`)
    return button
  }

  async function renderExpanded() {
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
    fireEvent.click(chevronOf('Work'))
    await waitFor(() =>
      expect(screen.queryByText('Weekly Team Sync')).not.toBeNull(),
    )
  }

  it('selects a folder together with everything inside it', async () => {
    await renderExpanded()

    fireEvent.click(rowOf('Work'), { ctrlKey: true })

    for (const name of [
      'Work',
      'Nested Subfolder',
      'Weekly Team Sync',
      'Q3 Product Roadmap',
    ]) {
      expect(isSelected(name)).toBe(true)
    }
    expect(isSelected('Personal')).toBe(false)
  })

  it('selects the contents of a collapsed folder too', async () => {
    await renderExpanded()
    fireEvent.click(chevronOf('Work'))
    await waitFor(() =>
      expect(screen.queryByText('Weekly Team Sync')).toBeNull(),
    )

    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    fireEvent.click(chevronOf('Work'))

    await waitFor(() =>
      expect(screen.queryByText('Weekly Team Sync')).not.toBeNull(),
    )
    expect(isSelected('Weekly Team Sync')).toBe(true)
    expect(isSelected('Nested Subfolder')).toBe(true)
  })

  it('Ctrl-clicking an item inside deselects it and its folder but not the rest', async () => {
    await renderExpanded()
    fireEvent.click(rowOf('Work'), { ctrlKey: true })

    fireEvent.click(rowOf('Weekly Team Sync'), { ctrlKey: true })

    expect(isSelected('Weekly Team Sync')).toBe(false)
    expect(isSelected('Work')).toBe(false)
    expect(isSelected('Nested Subfolder')).toBe(true)
    expect(isSelected('Q3 Product Roadmap')).toBe(true)
  })

  it('does not change the selection when the chevron is pressed', async () => {
    await renderExpanded()
    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    fireEvent.click(rowOf('Personal'), { ctrlKey: true })

    fireEvent.click(chevronOf('Work'))
    await waitFor(() =>
      expect(screen.queryByText('Weekly Team Sync')).toBeNull(),
    )

    expect(isSelected('Work')).toBe(true)
    expect(isSelected('Personal')).toBe(true)
  })

  it('does not select anything when only the chevron is pressed', async () => {
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())

    fireEvent.click(chevronOf('Work'))

    await waitFor(() =>
      expect(screen.queryByText('Weekly Team Sync')).not.toBeNull(),
    )
    expect(isSelected('Work')).toBe(false)
    expect(isSelected('Weekly Team Sync')).toBe(false)
  })

  it('opens the folder view on a plain click, without expanding it', async () => {
    mockNavigate.mockClear()
    renderSidebar()
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())

    fireEvent.click(rowOf('Work'))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/items/$itemId',
      params: { itemId: 'work-space' },
    })
    expect(screen.queryByText('Weekly Team Sync')).toBeNull()
  })
})

describe('Sidebar header and creating items', () => {
  const rowOf = (text: string) => {
    const row = screen
      .getAllByText(text)
      .map((el) => el.closest('[data-tree-row]'))
      .find((el): el is Element => el !== null)
    if (!row) throw new Error(`Row not found: ${text}`)
    return row
  }
  const isSelected = (text: string) =>
    rowOf(text).getAttribute('data-selected') === 'true'

  async function renderLoaded() {
    renderSidebar()
    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeNull()
      expect(screen.queryAllByText('Getting Started').length).toBeGreaterThan(0)
    })
  }

  const created = async (name: string) =>
    (await api.fetchItems()).filter((i) => i.name === name)

  beforeEach(() => {
    mockNavigate.mockClear()
    useItemsStore.getState().setActiveItemId(null)
  })

  it('titles the bar "Private" and has no Add New Page button', async () => {
    await renderLoaded()

    expect(screen.queryByText('Private')).not.toBeNull()
    expect(screen.queryByText('Private Pages')).toBeNull()
    expect(screen.queryByText('Add New Page')).toBeNull()
    expect(screen.getByRole('button', { name: 'Create New Note' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Create New Folder' }),
    ).toBeTruthy()
  })

  it('draws the header buttons with the same icons as elsewhere, not a plus', async () => {
    await renderLoaded()

    const noteIcon = screen
      .getByRole('button', { name: 'Create New Note' })
      .querySelector('svg')
    const folderIcon = screen
      .getByRole('button', { name: 'Create New Folder' })
      .querySelector('svg')
    expect(noteIcon?.classList.contains('lucide-file-plus')).toBe(true)
    expect(folderIcon?.classList.contains('lucide-folder-plus')).toBe(true)
    expect(noteIcon?.classList.contains('lucide-plus')).toBe(false)
  })

  describe('closing the open item', () => {
    it('closes it on a click on the bar', async () => {
      useItemsStore.getState().setActiveItemId('weekly-sync')
      await renderLoaded()

      fireEvent.click(screen.getByText('Private'))

      await waitFor(() =>
        expect(useItemsStore.getState().activeItemId).toBeNull(),
      )
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/items' })
    })

    it('closes it on a click on the blank part of the tree', async () => {
      useItemsStore.getState().setActiveItemId('weekly-sync')
      await renderLoaded()

      fireEvent.click(screen.getByTestId('tree-blank-area'))

      await waitFor(() =>
        expect(useItemsStore.getState().activeItemId).toBeNull(),
      )
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/items' })
    })

    it('clears the multi-selection too', async () => {
      await renderLoaded()
      fireEvent.click(rowOf('Work'), { ctrlKey: true })
      fireEvent.click(rowOf('Getting Started'), { ctrlKey: true })
      expect(isSelected('Work')).toBe(true)

      fireEvent.click(screen.getByText('Private'))

      await waitFor(() => expect(isSelected('Work')).toBe(false))
      expect(isSelected('Getting Started')).toBe(false)
    })

    it('leaves things alone for clicks on a row, a button or a modified click', async () => {
      useItemsStore.getState().setActiveItemId('weekly-sync')
      await renderLoaded()

      fireEvent.click(rowOf('Getting Started'))
      fireEvent.click(screen.getByRole('button', { name: 'Create New Note' }))
      fireEvent.click(screen.getByTestId('tree-blank-area'), { ctrlKey: true })
      fireEvent.click(screen.getByText('Private'), { shiftKey: true })

      await new Promise((r) => setTimeout(r, 30))
      expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/items' })
      expect(useItemsStore.getState().activeItemId).not.toBeNull()
    })
  })

  describe('where the header buttons create', () => {
    it('creates at the top level when nothing is open', async () => {
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Note' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create New Folder' }))

      await waitFor(async () => {
        expect(await created('Untitled Note')).toHaveLength(1)
        expect(await created('New Folder')).toHaveLength(1)
      })
      expect((await created('Untitled Note'))[0].parentId).toBeNull()
      expect((await created('New Folder'))[0].parentId).toBeNull()
    })

    it('creates inside the open folder, and shows it there', async () => {
      useItemsStore.getState().setActiveItemId('work-space')
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Note' }))

      await waitFor(async () =>
        expect((await created('Untitled Note'))[0]?.parentId).toBe(
          'work-space',
        ),
      )
      await waitFor(() =>
        expect(screen.queryByText('Untitled Note')).not.toBeNull(),
      )
    })

    it('creates beside the open note, in its parent folder', async () => {
      useItemsStore.getState().setActiveItemId('weekly-sync')
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Folder' }))

      await waitFor(async () =>
        expect((await created('New Folder'))[0]?.parentId).toBe('work-space'),
      )
    })

    it('creates at the top level beside an open top-level note', async () => {
      useItemsStore.getState().setActiveItemId('getting-started')
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Folder' }))

      await waitFor(async () =>
        expect(await created('New Folder')).toHaveLength(1),
      )
      expect((await created('New Folder'))[0].parentId).toBeNull()
    })

    it('treats an open item that no longer exists as nothing open', async () => {
      useItemsStore.getState().setActiveItemId('deleted-long-ago')
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Folder' }))

      await waitFor(async () =>
        expect(await created('New Folder')).toHaveLength(1),
      )
      expect((await created('New Folder'))[0].parentId).toBeNull()
    })
  })

  describe('folders without a popup', () => {
    it('creates a folder straight away, with no dialog', async () => {
      await renderLoaded()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Folder' }))

      await waitFor(() =>
        expect(screen.queryByText('New Folder')).not.toBeNull(),
      )
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByText('Create Folder')).toBeNull()
    })

    it('offers only Rename, Duplicate and Delete in the folder menu', async () => {
      await renderLoaded()
      const row = rowOf('Work')
      expect(row.querySelector('button[title="Create Note inside"]')).toBeNull()
      const trigger = row.querySelector('button[title="Folder actions"]')
      if (!trigger) throw new Error('Folder actions button not found')
      fireEvent.pointerDown(trigger, {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      })

      await screen.findByRole('menuitem', { name: 'Rename Folder' })

      expect(
        screen.getAllByRole('menuitem').map((item) => item.textContent),
      ).toEqual(['Rename Folder', 'Duplicate', 'Delete Folder'])
    })

    it('still renames a folder through the dialog', async () => {
      await renderLoaded()
      const trigger = rowOf('Work').querySelector(
        'button[title="Folder actions"]',
      )
      if (!trigger) throw new Error('Folder actions button not found')
      fireEvent.pointerDown(trigger, {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      })
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Rename Folder' }),
      )

      const input =
        await screen.findByPlaceholderText<HTMLInputElement>('Folder Name')
      expect(screen.getByRole('dialog').textContent).toContain('Rename Folder')
      expect(input.value).toBe('Work')
      fireEvent.change(input, { target: { value: 'Projects' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(async () =>
        expect((await api.fetchItem('work-space')).name).toBe('Projects'),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })
})
