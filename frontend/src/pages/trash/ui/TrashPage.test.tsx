import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOps } from '#/entities/item'
import {
  mockPageIds,
  mockTree,
  resetMockTree,
} from '#/entities/item/api/item.handlers'
import { TrashPage, daysLeft } from './TrashPage'

const router = vi.hoisted(() => {
  let params: { itemId?: string } = {}
  const listeners = new Set<() => void>()
  const set = (next: { itemId?: string }) => {
    params = next
    listeners.forEach((l) => l())
  }
  return {
    navigate: vi.fn((to: { to: string; params?: { itemId: string } }) => {
      set(to.params ? { itemId: to.params.itemId } : {})
      return Promise.resolve()
    }),
    get: () => params,
    set,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
})

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    useNavigate: () => router.navigate,
    useParams: () =>
      React.useSyncExternalStore(router.subscribe, router.get, router.get),
    Link: ({
      children,
      params,
      to,
      ...rest
    }: {
      children: ReactNode
      params?: { itemId: string }
      to: string
    }) => (
      <a href={params ? to.replace('$itemId', params.itemId) : to} {...rest}>
        {children}
      </a>
    ),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TrashPage />
    </QueryClientProvider>,
  )
}

const listed = () =>
  within(screen.getByRole('list', { name: 'Pages in the trash' }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('a span')?.textContent)
const sidebar = () =>
  within(screen.getByRole('tree', { name: 'Pages' }))
    .queryAllByRole('treeitem')
    .map((r) => r.textContent)

beforeEach(async () => {
  router.navigate.mockClear()
  router.set({})
  const ids = mockPageIds()
  await applyOps([{ op: 'trash', id: ids.Work }])
  await new Promise((r) => setTimeout(r, 5))
  await applyOps([{ op: 'trash', id: ids['Ideas inbox'] }])
})
afterEach(() => {
  cleanup()
  resetMockTree()
})

describe('TrashPage', () => {
  it('lists trashed pages, newest first, with days left', async () => {
    renderPage()
    await waitFor(() => expect(listed()).toEqual(['Ideas inbox', 'Work']))
    expect(screen.getAllByText(/30 days left/)).toHaveLength(2)
    const link = screen.getByText('Work').closest('a')
    expect(link?.getAttribute('href')).toBe(`/trash/${mockPageIds().Work}`)
  })

  it('restores a page to the sidebar with what was inside it', async () => {
    renderPage()
    await waitFor(() => expect(listed()).toHaveLength(2))
    fireEvent.click(screen.getByLabelText('Restore Work'))
    await waitFor(() => expect(listed()).toEqual(['Ideas inbox']))
    await waitFor(() => expect(sidebar()).toContain('💼Work'))
    expect(mockTree().items.get(mockPageIds()['Design checklist'])).toBeTruthy()
  })

  it('deletes a page forever only after confirming', async () => {
    renderPage()
    await waitFor(() => expect(listed()).toHaveLength(2))
    fireEvent.click(screen.getByLabelText('Delete Work forever'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mockTree().has(mockPageIds().Work)).toBe(true)

    fireEvent.click(screen.getByLabelText('Delete Work forever'))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete forever',
      }),
    )
    await waitFor(() => expect(listed()).toEqual(['Ideas inbox']))
    expect(mockTree().has(mockPageIds().Work)).toBe(false)
  })

  it('empties the trash after confirming', async () => {
    renderPage()
    await waitFor(() => expect(listed()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/All 2 pages/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty trash' }))
    expect(await screen.findByText('The trash is empty.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Empty trash' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('previews a trashed page read-only, and restores it from there', async () => {
    const ids = mockPageIds()
    router.set({ itemId: ids.Work })
    renderPage()
    const title = await screen.findByDisplayValue('Work')
    expect(title.hasAttribute('readonly')).toBe(true)
    expect(screen.getByText('This page is in the trash.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(router.navigate).toHaveBeenCalledWith({
        to: '/items/$itemId',
        params: { itemId: ids.Work },
      }),
    )
    expect(mockTree().items.get(ids.Work)?.trashed_at).toBeFalsy()
  })

  it('explains that a page inside a trashed page cannot be restored alone', async () => {
    router.set({ itemId: mockPageIds()['Design checklist'] })
    renderPage()
    expect(await screen.findByText(/inside a page in the trash/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })
})

describe('daysLeft', () => {
  it('rounds up and never goes below zero', () => {
    const now = Date.parse('2026-11-05T00:00:00Z')
    expect(daysLeft('2026-11-06T12:00:00Z', now)).toBe(2)
    expect(daysLeft('2026-11-05T00:00:00Z', now)).toBe(0)
    expect(daysLeft('2026-11-01T00:00:00Z', now)).toBe(0)
  })
})
