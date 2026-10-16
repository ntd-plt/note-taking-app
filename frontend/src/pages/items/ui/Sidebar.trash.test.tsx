import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { resetMockItems } from '#/mocks/items.handlers'
import * as api from '#/widgets/note-editor/api'
import { useItemsStore } from '#/widgets/note-editor'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ itemId: null }),
}))

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const showUndoToast = vi.hoisted(() => vi.fn())
vi.mock('#/widgets/note-editor/ui/UndoToast', () => ({ showUndoToast }))

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

const rowOf = (text: string) => {
  const row = screen
    .getAllByText(text)
    .map((el) => el.closest('[data-tree-row]'))
    .find((el): el is Element => el !== null)
  if (!row) throw new Error(`Row not found: ${text}`)
  return row
}

async function renderLoaded() {
  renderSidebar()
  await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
}

async function moveToTrash(folderName: string) {
  const trigger = rowOf(folderName).querySelector(
    'button[title="Folder actions"]',
  )
  if (!trigger) throw new Error('Folder actions button not found')
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Move to Trash' }),
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
  toast.mockClear()
  toast.error.mockClear()
  showUndoToast.mockClear()
  useItemsStore.getState().setActiveItemId(null)
})

afterEach(() => resetMockItems())

describe('moving to the trash', () => {
  it('removes the folder at once, without asking for confirmation, and offers Undo', async () => {
    await renderLoaded()

    await moveToTrash('Work')

    await waitFor(() => expect(screen.queryByText('Work')).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(showUndoToast).toHaveBeenCalledTimes(1))
    expect(showUndoToast.mock.calls[0][0]).toBe('Moved to trash')
    expect((await api.fetchTrash()).map((t) => t.name)).toContain('Work')
  })

  it('brings the folder back when Undo is pressed', async () => {
    await renderLoaded()
    await moveToTrash('Work')
    await waitFor(() => expect(showUndoToast).toHaveBeenCalled())

    showUndoToast.mock.calls[0][1]()

    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
    expect(await api.fetchTrash()).toEqual([])
  })

  it('tells the user when the move fails and keeps the folder', async () => {
    const { server } = await import('#/mocks/server')
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.post('/api/v1/items/trash', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    await renderLoaded()

    await moveToTrash('Work')

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not move to trash: boom'),
    )
    await waitFor(() => expect(screen.queryByText('Work')).not.toBeNull())
    expect(showUndoToast).not.toHaveBeenCalled()
  })
})

describe('the Trash entry', () => {
  it('opens the trash page', async () => {
    await renderLoaded()

    fireEvent.click(await screen.findByRole('button', { name: /^Trash$/ }))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/trash' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
