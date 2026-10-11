import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import * as api from '../api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Editor from './Editor'
import { SidebarProvider } from '#/components/ui/sidebar'
import { useItemsStore } from '../hooks/useItemsStore'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetMockItems } from '#/mocks/items.handlers'

// Mock tanstack router navigation
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ itemId: 'test-item-id' }),
}))

// Helper to render Editor inside necessary context providers
function renderEditor() {
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
        <Editor />
      </SidebarProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useItemsStore.getState().setActiveItemId(null)
})
afterEach(() => resetMockItems())

describe('Editor Component', () => {
  it('should render editor successfully without crashing', async () => {
    renderEditor()

    await waitFor(() => {
      // It should either render "No Page Selected" or the editor container
      const noPageSelected = screen.queryByText(/No Page Selected/i)
      const editorElement = document.querySelector('.tiptap')
      expect(noPageSelected || editorElement).not.toBeNull()
    })
  })

  it('offers to create a page when no note is open', async () => {
    renderEditor()

    await waitFor(() =>
      expect(screen.queryByText(/No Page Selected/i)).not.toBeNull(),
    )
  })

  it('loads the open note, its title and its body separately', async () => {
    useItemsStore.getState().setActiveItemId('weekly-sync')
    renderEditor()

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Weekly Team Sync')).not.toBeNull(),
    )
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Agenda',
      ),
    )
  })

  it('does not treat an open folder as a note', async () => {
    useItemsStore.getState().setActiveItemId('work-space')
    renderEditor()

    await waitFor(() =>
      expect(screen.queryByText(/No Page Selected/i)).not.toBeNull(),
    )
  })

  it('does not save, or change the updated time of, a note that was only opened', async () => {
    const before = await api.fetchItem('weekly-sync')
    const saves: string[] = []
    server.use(
      http.put('/api/v1/items/:id/content', async ({ params }) => {
        saves.push(params.id as string)
        return HttpResponse.json(
          { error: 'should not be called' },
          { status: 500 },
        )
      }),
    )
    useItemsStore.getState().setActiveItemId('weekly-sync')
    renderEditor()
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Agenda',
      ),
    )

    await new Promise((r) => setTimeout(r, 1500))

    expect(saves).toEqual([])
    expect((await api.fetchItem('weekly-sync')).updatedAt).toBe(
      before.updatedAt,
    )
    expect(useItemsStore.getState().savingItemId).toBeNull()
  }, 10000)

  it('does not save either when switching between notes', async () => {
    const saves: string[] = []
    server.use(
      http.put('/api/v1/items/:id/content', async ({ params }) => {
        saves.push(params.id as string)
        return HttpResponse.json(
          { error: 'should not be called' },
          { status: 500 },
        )
      }),
    )
    useItemsStore.getState().setActiveItemId('weekly-sync')
    renderEditor()
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Agenda',
      ),
    )

    useItemsStore.getState().setActiveItemId('product-roadmap')
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Roadmap',
      ),
    )
    useItemsStore.getState().setActiveItemId('getting-started')
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Welcome',
      ),
    )
    await new Promise((r) => setTimeout(r, 1500))

    expect(saves).toEqual([])
  }, 10000)

  it('still saves a real edit, and only that', async () => {
    const saves: string[] = []
    server.use(
      http.put('/api/v1/items/:id/content', async ({ params, request }) => {
        const body = (await request.json()) as { content: string }
        saves.push(`${params.id as string}:${body.content}`)
        return HttpResponse.json({
          item_id: params.id,
          content: body.content,
          updated_at: '2031-01-01T00:00:00.000Z',
        })
      }),
    )
    useItemsStore.getState().setActiveItemId('weekly-sync')
    renderEditor()
    await waitFor(() =>
      expect(document.querySelector('.tiptap')?.textContent).toContain(
        'Agenda',
      ),
    )
    await new Promise((r) => setTimeout(r, 300))
    expect(saves).toEqual([])

    const paragraph = document.querySelector('.tiptap p')!
    paragraph.firstChild!.textContent = 'EDITED BY THE USER'

    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 })
    expect(saves[0]).toContain('weekly-sync:')
    expect(saves[0]).toContain('EDITED BY THE USER')
  }, 10000)
})
