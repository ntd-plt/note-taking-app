import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '#/components/ui/sidebar'
import * as api from '#/widgets/note-editor/api'
import { resetMockItems } from '#/mocks/items.handlers'
import { useItemsStore } from '#/widgets/note-editor'
import type { Item } from '#/shared/models'
import { FolderView } from './FolderView'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}))

afterEach(() => {
  resetMockItems()
  mockNavigate.mockClear()
})

async function renderFolder(folderId: string) {
  const items = await api.fetchItems()
  const folder = items.find((i) => i.id === folderId) as Item
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['items'], items)
  render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <FolderView folder={folder} />
      </SidebarProvider>
    </QueryClientProvider>,
  )
  return { client, folder }
}

describe('FolderView', () => {
  it('shows the folder and its direct contents, folders first and then by name', async () => {
    await renderFolder('work-space')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Work' }),
    ).not.toBeNull()
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Nested Subfolder')
    expect(rows[1]).toContain('Q3 Product Roadmap')
    expect(rows[2]).toContain('Weekly Team Sync')
  })

  it('does not list items from other folders or deeper levels', async () => {
    const nested = await api.createItem({
      type: 'note',
      name: 'Buried',
      parentId: 'nested-folder',
    })
    await renderFolder('work-space')

    expect(screen.queryByText('Buried')).toBeNull()
    expect(screen.queryByText('Getting Started')).toBeNull()
    expect(nested.parentId).toBe('nested-folder')
  })

  it('opens an item when its row is clicked', async () => {
    await renderFolder('work-space')

    fireEvent.click(screen.getByText('Weekly Team Sync'))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/items/$itemId',
      params: { itemId: 'weekly-sync' },
    })
    expect(useItemsStore.getState().activeItemId).toBe('weekly-sync')
  })

  it('has icon-only New note and New folder buttons beside the title, on the right', async () => {
    await renderFolder('work-space')

    const note = screen.getByRole('button', { name: 'New note' })
    const folder = screen.getByRole('button', { name: 'New folder' })
    expect(note.textContent).toBe('')
    expect(folder.textContent).toBe('')
    expect(note.querySelector('svg')).not.toBeNull()
    expect(folder.querySelector('svg')).not.toBeNull()
    const heading = screen.getByRole('heading', { level: 1, name: 'Work' })
    const row = heading.closest('div.justify-between')
    expect(row).not.toBeNull()
    expect(row!.contains(note) && row!.contains(folder)).toBe(true)
    expect(
      heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(note.parentElement).toBe(row!.lastElementChild)
  })

  it('styles the buttons like the sidebar ones: no border, icon colour on hover', async () => {
    await renderFolder('work-space')

    for (const name of ['New note', 'New folder']) {
      const classes = screen.getByRole('button', { name }).className.split(' ')
      expect(
        classes.some((c) => c === 'border' || c.startsWith('border-')),
      ).toBe(false)
      expect(classes).toContain('hover:text-primary')
      expect(classes).toContain('active:text-primary')
      expect(classes).toContain('text-muted-foreground/60')
    }
  })

  it('says so when the folder is empty', async () => {
    const empty = await api.createItem({ type: 'folder', name: 'Empty' })
    await renderFolder(empty.id)

    expect(screen.queryByText('This folder is empty.')).not.toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('creates a note inside the folder and stays on the folder page', async () => {
    useItemsStore.getState().setActiveItemId('nested-folder')
    await renderFolder('nested-folder')

    fireEvent.click(screen.getByRole('button', { name: /new note/i }))

    await waitFor(async () =>
      expect(
        (await api.fetchItems()).find((i) => i.parentId === 'nested-folder'),
      ).toMatchObject({ type: 'note', name: 'Untitled Note' }),
    )
    expect(screen.queryByText('Untitled Note')).not.toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useItemsStore.getState().activeItemId).toBe('nested-folder')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nested Subfolder' }),
    ).not.toBeNull()
  })

  it('creates a subfolder inside the folder without leaving the view', async () => {
    await renderFolder('nested-folder')

    fireEvent.click(screen.getByRole('button', { name: /new folder/i }))

    await waitFor(async () => {
      const created = (await api.fetchItems()).find(
        (i) => i.parentId === 'nested-folder',
      )
      expect(created).toMatchObject({ type: 'folder', name: 'New Folder' })
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.queryByText('New Folder')).not.toBeNull()
  })
})
