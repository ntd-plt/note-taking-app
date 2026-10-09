import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMockItems } from '#/mocks/items.handlers'
import { useItemsStore } from '#/widgets/note-editor'
import { ItemsPage } from './ItemsPage'

const router = vi.hoisted(() => {
  let params: { itemId?: string } = {}
  const listeners = new Set<() => void>()
  return {
    navigate: vi.fn(),
    get: () => params,
    set: (next: { itemId?: string }) => {
      params = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
})
const navigate = router.navigate
vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    useNavigate: () => router.navigate,
    useParams: () =>
      React.useSyncExternalStore(router.subscribe, router.get, router.get),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ItemsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  navigate.mockReset()
  router.set({})
  useItemsStore.getState().setActiveItemId(null)
})
afterEach(() => resetMockItems())

describe('ItemsPage on /items', () => {
  it('reopens the last note', async () => {
    useItemsStore.getState().setActiveItemId('weekly-sync')
    renderPage()

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Weekly Team Sync')).not.toBeNull(),
    )
  })

  it('reopens the last folder as the folder view', async () => {
    useItemsStore.getState().setActiveItemId('work-space')
    renderPage()

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Work' }),
      ).not.toBeNull(),
    )
    expect(screen.queryByText(/No Page Selected/i)).toBeNull()
  })

  it('shows "No Page Selected" when nothing was open', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.queryByText(/No Page Selected/i)).not.toBeNull(),
    )
  })

  it('shows "No Page Selected" when the last item no longer exists', async () => {
    useItemsStore.getState().setActiveItemId('deleted-long-ago')
    renderPage()

    await waitFor(() =>
      expect(screen.queryByText(/No Page Selected/i)).not.toBeNull(),
    )
  })

  it('lets the URL win over the stored item', async () => {
    useItemsStore.getState().setActiveItemId('weekly-sync')
    router.set({ itemId: 'work-space' })
    renderPage()

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Work' }),
      ).not.toBeNull(),
    )
  })
})

describe('closing the open item from the sidebar', () => {
  it('shows "No Page Selected" once the URL has moved to /items, and keeps showing it', async () => {
    useItemsStore.getState().setActiveItemId('weekly-sync')
    router.set({ itemId: 'weekly-sync' })
    navigate.mockImplementation(async () => {
      setTimeout(() => act(() => router.set({})), 30)
    })
    renderPage()
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Weekly Team Sync')).not.toBeNull(),
    )

    fireEvent.click(screen.getByText('Private'))

    await waitFor(() =>
      expect(screen.queryByText(/No Page Selected/i)).not.toBeNull(),
    )
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByText(/No Page Selected/i)).not.toBeNull()
    expect(useItemsStore.getState().activeItemId).toBeNull()
    expect(navigate).toHaveBeenCalledWith({ to: '/items' })
  })

  it('a reload of /items afterwards has nothing to reopen', async () => {
    useItemsStore.getState().setActiveItemId('weekly-sync')
    navigate.mockResolvedValue(undefined)
    renderPage()
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Weekly Team Sync')).not.toBeNull(),
    )
    fireEvent.click(screen.getByText('Private'))
    await waitFor(() =>
      expect(useItemsStore.getState().activeItemId).toBeNull(),
    )
    expect(
      JSON.parse(localStorage.getItem('items-workspace-storage') ?? '{}').state
        ?.activeItemId ?? null,
    ).toBeNull()
  })
})
