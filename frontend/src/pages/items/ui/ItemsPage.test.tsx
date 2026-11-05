import {
  act,
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
import {
  mockPageIds,
  mockTree,
  resetMockTree,
} from '#/entities/item/api/item.handlers'
import { ItemsPage } from './ItemsPage'

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
      <a href={params ? `/items/${params.itemId}` : to} {...rest}>
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
      <ItemsPage />
    </QueryClientProvider>,
  )
}

const tree = () => screen.getByRole('tree', { name: 'Pages' })
const rowNames = () =>
  within(tree())
    .queryAllByRole('treeitem')
    .map((r) => r.textContent)
const names = (ids: string[]) =>
  ids.map((id) => String(mockTree().items.get(id)?.props?.name ?? '?'))
const SAVED = { timeout: 3000 }

beforeEach(() => {
  router.navigate.mockClear()
  router.set({})
})
afterEach(() => {
  cleanup()
  resetMockTree()
})

describe('ItemsPage', () => {
  it('lists top-level pages and expands a page to show its children', async () => {
    renderPage()
    await waitFor(() =>
      expect(rowNames()).toEqual([
        '🚀Getting Started',
        '💼Work',
        '🏡Personal',
        '💡Ideas inbox',
      ]),
    )
    const work = within(tree()).getByText('Work').closest('[role=treeitem]')!
    fireEvent.click(within(work as HTMLElement).getByLabelText('Expand'))
    expect(rowNames()).toContain('🎨Website Redesign')
    expect(rowNames()).toContain('📅Weekly sync')
  })

  it('opens a page with its breadcrumb, title and blocks', async () => {
    const ids = mockPageIds()
    router.set({ itemId: ids['Design checklist'] })
    renderPage()
    expect(await screen.findByDisplayValue('Design checklist')).toBeTruthy()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs.textContent).toBe(
      'Workspace>💼Work>🎨Website Redesign>✅Design checklist',
    )
    expect(await screen.findByText('Typography')).toBeTruthy()
    // The open page's parents are expanded in the sidebar.
    expect(rowNames()).toContain('✅Design checklist')
  })

  it('opens a block URL as its page and switches to the page URL', async () => {
    const ids = mockPageIds()
    const block = mockTree().items.get(ids.Work)!.child_ids![0]
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.id ?? '')
    }
    router.set({ itemId: block })
    renderPage()
    expect(await screen.findByDisplayValue('Work')).toBeTruthy()
    await waitFor(() =>
      expect(router.navigate).toHaveBeenCalledWith({
        to: '/items/$itemId',
        params: { itemId: ids.Work },
        replace: true,
      }),
    )
    expect(scrolled).toEqual([block])
    expect(screen.getByDisplayValue('Work')).toBeTruthy()
  })

  it('renames a page from its title and updates the sidebar', async () => {
    const ids = mockPageIds()
    router.set({ itemId: ids['Ideas inbox'] })
    renderPage()
    const title = await screen.findByDisplayValue('Ideas inbox')
    fireEvent.change(title, { target: { value: 'Someday' } })
    await waitFor(() => expect(rowNames()).toContain('💡Someday'), SAVED)
    expect(mockTree().items.get(ids['Ideas inbox'])?.props?.name).toBe(
      'Someday',
    )
  })

  it('does not send a blank title', async () => {
    const ids = mockPageIds()
    router.set({ itemId: ids['Ideas inbox'] })
    renderPage()
    const title = await screen.findByDisplayValue('Ideas inbox')
    fireEvent.change(title, { target: { value: '   ' } })
    fireEvent.blur(title)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockTree().items.get(ids['Ideas inbox'])?.props?.name).toBe(
      'Ideas inbox',
    )
  })

  it('adds a top-level page at the end and opens it', async () => {
    renderPage()
    await waitFor(() => expect(rowNames()).toHaveLength(4))
    fireEvent.click(screen.getByLabelText('Add a page'))
    await waitFor(() => expect(rowNames()).toHaveLength(5))
    expect(rowNames().at(-1)).toBe('📄New Page')
    const ws = mockTree().items.get(mockTree().workspaceId)!
    const created = ws.child_ids!.at(-1)!
    expect(router.navigate).toHaveBeenCalledWith({
      to: '/items/$itemId',
      params: { itemId: created },
    })
  })

  it('adds a page inside a page, before its trailing paragraph', async () => {
    const ids = mockPageIds()
    renderPage()
    await waitFor(() => expect(rowNames()).toHaveLength(4))
    fireEvent.click(screen.getByLabelText('Add a page inside Personal'))
    await waitFor(() =>
      expect(rowNames()).toEqual([
        '🚀Getting Started',
        '💼Work',
        '🏡Personal',
        '📚Reading list',
        '📄New Page',
        '💡Ideas inbox',
      ]),
    )
    const kids = mockTree().items.get(ids.Personal)!.child_ids!
    expect(mockTree().items.get(kids.at(-1)!)?.type).toBe('paragraph')
  })

  it('shows the empty state with no pages, and can add the first one', async () => {
    resetMockTree({ empty: true })
    renderPage()
    expect(await screen.findByText(/No pages yet/)).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByLabelText('Add a page')).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(screen.getByLabelText('Add a page'))
    await waitFor(() => expect(rowNames()).toEqual(['📄New Page']))
  })

  describe('dragging pages', () => {
    // Rows are 28 px tall from y = 0, in on-screen order.
    function layoutRows() {
      return vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          const rows = [...document.querySelectorAll('[data-page-row]')]
          const i = rows.indexOf(this)
          return i < 0 ? new DOMRect() : new DOMRect(0, i * 28, 200, 28)
        })
    }
    const row = (name: string) =>
      within(tree()).getByText(name).closest('[role=treeitem]') as HTMLElement
    async function drag(name: string, toY: number) {
      fireEvent.pointerDown(row(name), { button: 0, clientX: 10, clientY: 1 })
      fireEvent.pointerMove(window, { clientX: 10, clientY: toY })
      await act(async () => {
        fireEvent.pointerUp(window, { clientX: 10, clientY: toY })
      })
    }

    it('drops a page onto another, as the last item of its content', async () => {
      const ids = mockPageIds()
      renderPage()
      await waitFor(() => expect(rowNames()).toHaveLength(4))
      const spy = layoutRows()
      // Middle of "Personal" (row 2: 56..84).
      await drag('Ideas inbox', 70)
      spy.mockRestore()
      await waitFor(() =>
        expect(names(mockTree().items.get(ids.Personal)!.child_ids!)).toEqual([
          'Reading list',
          'Ideas inbox',
          '?',
        ]),
      )
      // The target is expanded to show where the page went.
      await waitFor(() => expect(rowNames()).toContain('💡Ideas inbox'))
      expect(rowNames()).toContain('📚Reading list')
    })

    it('drops a page between two pages, right after the one above', async () => {
      renderPage()
      await waitFor(() => expect(rowNames()).toHaveLength(4))
      const spy = layoutRows()
      // Bottom edge of "Getting Started" (row 0: 0..28).
      await drag('Ideas inbox', 26)
      spy.mockRestore()
      await waitFor(() =>
        expect(
          names(mockTree().items.get(mockTree().workspaceId)!.child_ids!),
        ).toEqual(['Getting Started', 'Ideas inbox', 'Work', 'Personal']),
      )
    })

    it('refuses to drop a page into itself and shows no indicator', async () => {
      renderPage()
      await waitFor(() => expect(rowNames()).toHaveLength(4))
      const spy = layoutRows()
      fireEvent.pointerDown(row('Work'), {
        button: 0,
        clientX: 10,
        clientY: 30,
      })
      fireEvent.pointerMove(window, { clientX: 10, clientY: 42 })
      expect(row('Work').dataset.dropTarget).toBeUndefined()
      await act(async () => {
        fireEvent.pointerUp(window, { clientX: 10, clientY: 42 })
      })
      spy.mockRestore()
      expect(
        names(mockTree().items.get(mockTree().workspaceId)!.child_ids!),
      ).toEqual(['Getting Started', 'Work', 'Personal', 'Ideas inbox'])
    })

    it('opens a page on a click, even after a drag that ended elsewhere', async () => {
      const ids = mockPageIds()
      renderPage()
      await waitFor(() => expect(rowNames()).toHaveLength(4))
      const spy = layoutRows()
      await drag('Work', 40) // into itself: refused, and no click follows
      spy.mockRestore()
      await new Promise((r) => setTimeout(r, 10))
      fireEvent.click(row('Personal'))
      expect(router.get().itemId).toBe(ids.Personal)
    })
  })
})
