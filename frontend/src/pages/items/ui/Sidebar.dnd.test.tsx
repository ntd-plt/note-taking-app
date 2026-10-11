import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './Sidebar'
import { SidebarProvider } from '#/components/ui/sidebar'
import * as api from '#/widgets/note-editor/api'
import { resetMockItems } from '#/mocks/items.handlers'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ itemId: null }),
}))

const ROW_HEIGHT = 40

// jsdom has no layout, so give every tree row a rectangle based on its position.
function rowRects() {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(document.querySelectorAll('.group'))
      const index = rows.indexOf(this)
      const top = index === -1 ? 0 : index * ROW_HEIGHT
      const height = index === -1 ? 0 : ROW_HEIGHT
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 240,
        bottom: top + height,
        width: index === -1 ? 0 : 240,
        height,
        toJSON: () => ({}),
      }
    })
}

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
const centerY = (row: Element) =>
  Array.from(document.querySelectorAll('.group')).indexOf(row) * ROW_HEIGHT +
  ROW_HEIGHT / 2

// A real pointer drag: press on `from`, move past the activation distance, then onto `to`.
async function drag(from: Element, to: Element) {
  const y0 = centerY(from)
  const pointer = { pointerId: 1, isPrimary: true, button: 0, clientX: 100 }
  await act(async () => {
    fireEvent.pointerDown(from, { ...pointer, clientY: y0 })
  })
  await act(async () => {
    fireEvent.pointerMove(document, { ...pointer, clientY: y0 + 12 })
  })
  await act(async () => {
    fireEvent.pointerMove(document, { ...pointer, clientY: centerY(to) })
  })
  await act(async () => {
    fireEvent.pointerUp(document, { ...pointer, clientY: centerY(to) })
  })
  // dnd-kit swallows the click that follows a drag with a document listener it removes
  // after 50ms. Wait it out so it cannot eat the next test's clicks.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

describe('Sidebar drag and drop', () => {
  let rects: ReturnType<typeof rowRects>
  beforeEach(() => {
    rects = rowRects()
  })
  afterEach(() => {
    rects.mockRestore()
    resetMockItems()
  })

  async function loaded() {
    renderSidebar()
    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeNull()
      expect(screen.queryAllByText('Getting Started').length).toBeGreaterThan(0)
    })
  }

  it('moves a selected folder together with the selected open note', async () => {
    await loaded()
    fireEvent.click(rowOf('Getting Started'), { ctrlKey: true })
    fireEvent.click(rowOf('Personal'), { ctrlKey: true })

    await drag(rowOf('Personal'), rowOf('Work'))

    await waitFor(async () => {
      const items = await api.fetchItems()
      expect(items.find((i) => i.id === 'getting-started')?.parentId).toBe(
        'work-space',
      )
    })
    const items = await api.fetchItems()
    expect(items.find((i) => i.id === 'personal-space')?.parentId).toBe(
      'work-space',
    )
  })

  it('leaves the open note behind when it is not part of the selection', async () => {
    await loaded()
    fireEvent.click(rowOf('Personal'), { ctrlKey: true })

    await drag(rowOf('Personal'), rowOf('Work'))

    await waitFor(async () => {
      const items = await api.fetchItems()
      expect(items.find((i) => i.id === 'personal-space')?.parentId).toBe(
        'work-space',
      )
    })
    const items = await api.fetchItems()
    expect(items.find((i) => i.id === 'getting-started')?.parentId).toBeNull()
  })

  it('moves a dragged folder with its contents and creates nothing', async () => {
    await loaded()
    const before = await api.fetchItems()

    await drag(rowOf('Work'), rowOf('Personal'))

    await waitFor(async () => {
      const items = await api.fetchItems()
      expect(items.find((i) => i.id === 'work-space')?.parentId).toBe(
        'personal-space',
      )
    })
    const items = await api.fetchItems()
    expect(items).toHaveLength(before.length)
    for (const id of ['nested-folder', 'weekly-sync', 'product-roadmap']) {
      expect(items.find((i) => i.id === id)?.parentId).toBe('work-space')
    }
  })

  it('leaves behind an item that was Ctrl-clicked out of a selected folder', async () => {
    await loaded()
    fireEvent.click(
      within(rowOf('Work') as HTMLElement).getAllByRole('button')[0],
    )
    await waitFor(() =>
      expect(screen.queryByText('Q3 Product Roadmap')).not.toBeNull(),
    )
    fireEvent.click(rowOf('Work'), { ctrlKey: true })
    fireEvent.click(rowOf('Weekly Team Sync'), { ctrlKey: true })

    await drag(rowOf('Q3 Product Roadmap'), rowOf('Personal'))

    await waitFor(async () => {
      const items = await api.fetchItems()
      expect(items.find((i) => i.id === 'product-roadmap')?.parentId).toBe(
        'personal-space',
      )
    })
    const items = await api.fetchItems()
    expect(items.find((i) => i.id === 'nested-folder')?.parentId).toBe(
      'personal-space',
    )
    expect(items.find((i) => i.id === 'weekly-sync')?.parentId).toBe(
      'work-space',
    )
    expect(items.find((i) => i.id === 'work-space')?.parentId).toBeNull()
  })

  it('colours a selected row, including the open note', async () => {
    await loaded()
    const open = rowOf('Getting Started')
    const other = rowOf('Personal')
    expect(open.className).not.toContain('ring-blue-500')

    fireEvent.click(open, { ctrlKey: true })
    fireEvent.click(other, { ctrlKey: true })

    expect(open.className).toContain('ring-blue-500')
    expect(other.className).toContain('ring-blue-500')
    expect(rowOf('Work').className).not.toContain('ring-blue-500')
  })
})
