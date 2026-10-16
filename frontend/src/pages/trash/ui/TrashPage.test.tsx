import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest'
import { resetMockItems } from '#/mocks/items.handlers'
import * as api from '#/widgets/note-editor/api'
import { useItemsStore } from '#/widgets/note-editor'
import { TrashPage } from './TrashPage'

const mockNavigate = vi.fn()
let mockParams: { itemId?: string } = {}
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TrashPage />
    </QueryClientProvider>,
  )
}

// Work (folder) > Sub (folder) > Deep (note), plus Plain (note) next to Work.
async function trashedTree() {
  resetMockItems({ empty: true })
  const work = await api.createItem({ type: 'folder', name: 'Work' })
  const sub = await api.createItem({
    type: 'folder',
    name: 'Sub',
    parentId: work.id,
  })
  const deep = await api.createItem({
    type: 'note',
    name: 'Deep',
    parentId: sub.id,
  })
  const plain = await api.createItem({ type: 'note', name: 'Plain' })
  await api.trashItems([work.id, plain.id])
  return { work, sub, deep, plain }
}

const list = () => screen.findByRole('list', { name: 'Trash contents' })
const names = (ul: HTMLElement) =>
  within(ul)
    .getAllByRole('listitem')
    .map(
      (li) => li.querySelector('button, span:not([aria-hidden])')?.textContent,
    )

beforeEach(() => {
  useItemsStore.getState().setActiveItemId(null)
  mockNavigate.mockClear()
  mockParams = {}
})
afterEach(() => resetMockItems())

describe('the trash page', () => {
  it('lists what was trashed at the top, with folders first and no folder contents', async () => {
    await trashedTree()
    renderPage()

    expect(names(await list())).toEqual(['Work', 'Plain'])
    expect(screen.queryByText('Sub')).toBeNull()
    expect(screen.queryByText('Deep')).toBeNull()
  })

  it('does not link the Trash crumb to the page you are already on', async () => {
    await trashedTree()
    renderPage()
    await list()

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).queryByRole('button', { name: 'Trash' })).toBeNull()
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Trash',
    )
  })

  it('shows nothing as open in the sidebar tree while the trash is watched', async () => {
    const { sub } = await trashedTree()
    const live = await api.createItem({ type: 'note', name: 'Live' })
    useItemsStore.getState().setActiveItemId(live.id)
    // The address names a trashed folder: that is not an item being opened.
    mockParams = { itemId: sub.id }
    renderPage()
    await list()

    await waitFor(() =>
      expect(useItemsStore.getState().activeItemId).toBeNull(),
    )
    const row = screen
      .getAllByText('Live')
      .map((el) => el.closest('[data-tree-row]'))
      .find((el) => el !== null)
    expect(row).toBeTruthy()
    expect(document.querySelector('[data-tree-row][data-active]')).toBeNull()
  })

  it('opens a trashed folder to show what was inside it', async () => {
    const { work } = await trashedTree()
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Work' }))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/trash/$itemId',
      params: { itemId: work.id },
    })
  })

  it('shows the contents of the trashed folder named in the address, with a breadcrumb', async () => {
    const { sub } = await trashedTree()
    mockParams = { itemId: sub.id }
    renderPage()

    expect(names(await list())).toEqual(['Deep'])
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    fireEvent.click(within(crumbs).getByRole('button', { name: 'Trash' }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/trash' })
    expect(within(crumbs).getByRole('button', { name: /Work/ })).toBeTruthy()
    expect(
      crumbs.querySelector('[aria-current="page"]')?.textContent,
    ).toContain('Sub')
    expect(screen.queryByRole('button', { name: 'Empty Trash' })).toBeNull()
  })

  it('restores only a child, to the top level, leaving its folder in the trash', async () => {
    const { work, sub, deep } = await trashedTree()
    mockParams = { itemId: sub.id }
    renderPage()
    await list()

    fireEvent.click(screen.getByRole('button', { name: 'Restore Deep' }))

    await waitFor(() =>
      expect(screen.getByText('This folder is empty.')).toBeTruthy(),
    )
    expect((await api.fetchItem(deep.id)).parentId).toBeNull()
    expect((await api.fetchTrash()).map((t) => t.id).sort()).toEqual(
      [
        work.id,
        sub.id,
        (await api.fetchTrash()).find((t) => t.name === 'Plain')!.id,
      ].sort(),
    )
  })

  it('restores a folder together with what was trashed with it', async () => {
    const { work, deep } = await trashedTree()
    renderPage()
    await list()

    fireEvent.click(screen.getByRole('button', { name: 'Restore Work' }))

    await waitFor(() =>
      expect(
        names(screen.getByRole('list', { name: 'Trash contents' })),
      ).toEqual(['Plain']),
    )
    expect((await api.fetchItem(work.id)).parentId).toBeNull()
    expect((await api.fetchItem(deep.id)).name).toBe('Deep')
  })

  it('asks before deleting permanently, and keeps the item when cancelled', async () => {
    const { plain } = await trashedTree()
    renderPage()
    await list()

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Plain permanently' }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: 'Delete Permanently',
    })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await api.fetchTrash()).map((t) => t.id)).toContain(plain.id)

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Plain permanently' }),
    )
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(async () =>
      expect((await api.fetchTrash()).map((t) => t.id)).not.toContain(plain.id),
    )
    await waitFor(() => expect(screen.queryByText('Plain')).toBeNull())
  })

  it('asks before emptying the trash', async () => {
    await trashedTree()
    renderPage()
    await list()

    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }))
    const confirm = await screen.findByRole('dialog', { name: 'Empty Trash' })
    expect((await api.fetchTrash()).length).toBeGreaterThan(0)

    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Empty Trash' }),
    )

    await waitFor(async () => expect(await api.fetchTrash()).toEqual([]))
    await screen.findByText('The trash is empty.')
  })

  it('says so when the trash is empty, and disables Empty Trash', async () => {
    resetMockItems({ empty: true })
    renderPage()

    await screen.findByText('The trash is empty.')
    expect(screen.getByRole('button', { name: 'Empty Trash' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('says so when the folder in the address is no longer in the trash', async () => {
    await trashedTree()
    mockParams = { itemId: 'gone' }
    renderPage()

    await screen.findByText('This folder is no longer in the trash.')
  })
})
