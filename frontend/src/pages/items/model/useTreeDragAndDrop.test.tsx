import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import type { Item } from '#/shared/models'
import { ROOT_DROP_ID } from './treeDnd'
import { useTreeDragAndDrop } from './useTreeDragAndDrop'

afterEach(cleanup)

const folder = (id: string, parentId: string | null = null): Item => ({
  id,
  type: 'folder',
  name: id,
  parentId,
  icon: '',
  isFavorite: false,
})
const note = (id: string, parentId: string | null = null): Item => ({
  id,
  type: 'note',
  name: id,
  parentId,
  icon: '',
  isFavorite: false,
})

// dest, A { B (folder) { deep }, in-a }, loose
const items = [
  folder('dest'),
  folder('A'),
  folder('B', 'A'),
  note('in-a', 'A'),
  note('deep', 'B'),
  note('loose'),
]

const startEvent = (id: string) =>
  ({ active: { id } }) as unknown as DragStartEvent
const overEvent = (id: string) => ({ over: { id } }) as unknown as DragOverEvent
const endEvent = (id: string | null) =>
  ({ over: id === null ? null : { id } }) as unknown as DragEndEvent

type MoveRequest = { items: Array<{ id: string; parent_id: string | null }> }

function setup(selected: string[] = []) {
  const requests: MoveRequest[] = []
  server.use(
    http.patch('/api/v1/items', async ({ request }) => {
      const body = (await request.json()) as MoveRequest
      requests.push(body)
      return HttpResponse.json(
        body.items.map((m) => ({ ...items.find((i) => i.id === m.id), ...m })),
      )
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['items'], items)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const callbacks = {
    onSelectOnly: vi.fn(),
    onDropInto: vi.fn(),
    onDropped: vi.fn(),
  }
  const selectedIds = new Set(selected)
  const hook = renderHook(
    () => useTreeDragAndDrop({ items, selectedIds, ...callbacks }),
    { wrapper },
  )
  return { hook, requests, callbacks, client }
}

describe('useTreeDragAndDrop', () => {
  it('moves the dragged row into the folder it is dropped on', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent('loose')))
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      items: [{ id: 'loose', parent_id: 'dest' }],
    })
    expect(callbacks.onDropInto).toHaveBeenCalledWith('dest')
    expect(callbacks.onDropped).toHaveBeenCalled()
  })

  it('drags only the row when it is not part of the selection', () => {
    const { hook, callbacks } = setup(['in-a'])

    act(() => hook.result.current.onDragStart(startEvent('loose')))

    expect(callbacks.onSelectOnly).toHaveBeenCalledWith(['loose'])
    expect(hook.result.current.dragged).toEqual(['loose'])
  })

  it('drags a folder as one item that carries its contents', async () => {
    const { hook, requests } = setup()

    act(() => hook.result.current.onDragStart(startEvent('A')))

    expect(hook.result.current.dragged).toEqual(['A'])
    expect([...hook.result.current.draggingIds].sort()).toEqual([
      'A',
      'B',
      'deep',
      'in-a',
    ])
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual([{ id: 'A', parent_id: 'dest' }])
  })

  it('drags the whole selection, moving each top-level member once', async () => {
    const { hook, requests, callbacks } = setup([
      'A',
      'B',
      'deep',
      'in-a',
      'loose',
    ])

    act(() => hook.result.current.onDragStart(startEvent('loose')))
    expect(callbacks.onSelectOnly).not.toHaveBeenCalled()
    expect(hook.result.current.dragged).toEqual(['A', 'loose'])
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual([
      { id: 'A', parent_id: 'dest' },
      { id: 'loose', parent_id: 'dest' },
    ])
  })

  it('moves what is left of a folder after an item was Ctrl-clicked out of it', async () => {
    const { hook, requests } = setup(['B', 'deep', 'loose'])

    act(() => hook.result.current.onDragStart(startEvent('B')))
    expect(hook.result.current.dragged).toEqual(['B', 'loose'])
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual([
      { id: 'B', parent_id: 'dest' },
      { id: 'loose', parent_id: 'dest' },
    ])
  })

  it('moves to the top level when dropped on the tree area', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent('B')))
    act(() => hook.result.current.onDragOver(overEvent(ROOT_DROP_ID)))
    expect(hook.result.current.dropOnRoot).toBe(true)
    act(() => hook.result.current.onDragEnd(endEvent(ROOT_DROP_ID)))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual([{ id: 'B', parent_id: null }])
    expect(callbacks.onDropInto).toHaveBeenCalledWith(null)
  })

  it("treats a drop on a note as a drop into that note's folder", async () => {
    const { hook, requests } = setup()

    act(() => hook.result.current.onDragStart(startEvent('loose')))
    act(() => hook.result.current.onDragEnd(endEvent('in-a')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual([{ id: 'loose', parent_id: 'A' }])
  })

  it('updates the tree optimistically and keeps the ids', async () => {
    const { hook, client } = setup()

    act(() => hook.result.current.onDragStart(startEvent('A')))
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => {
      const cached = client.getQueryData<Item[]>(['items'])!
      expect(cached.find((i) => i.id === 'A')?.parentId).toBe('dest')
    })
    const cached = client.getQueryData<Item[]>(['items'])!
    expect(cached).toHaveLength(items.length)
    expect(cached.find((i) => i.id === 'B')?.parentId).toBe('A')
  })

  it('highlights the folder under the pointer only while it is a valid target', () => {
    const { hook } = setup()

    act(() => hook.result.current.onDragStart(startEvent('A')))
    act(() => hook.result.current.onDragOver(overEvent('dest')))
    expect(hook.result.current.dropFolderId).toBe('dest')

    act(() => hook.result.current.onDragOver(overEvent('B')))
    expect(hook.result.current.dropFolderId).toBeNull()
    expect(hook.result.current.dropOnRoot).toBe(false)
  })

  it('ignores drops onto the dragged folder or its descendants', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent('A')))
    expect([...hook.result.current.invalidTargetIds].sort()).toEqual([
      'A',
      'B',
      'deep',
      'in-a',
    ])
    act(() => hook.result.current.onDragEnd(endEvent('B')))
    act(() => hook.result.current.onDragStart(startEvent('A')))
    act(() => hook.result.current.onDragEnd(endEvent('A')))

    // Give any wrongly-sent request time to arrive before asserting none did.
    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(callbacks.onDropped).not.toHaveBeenCalled()
  })

  it('does nothing when dropped outside any target', async () => {
    const { hook, requests } = setup()

    act(() => hook.result.current.onDragStart(startEvent('loose')))
    act(() => hook.result.current.onDragEnd(endEvent(null)))

    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(hook.result.current.dragged).toEqual([])
  })

  it('skips the request when nothing would change', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent('in-a')))
    act(() => hook.result.current.onDragEnd(endEvent('A')))

    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(callbacks.onDropInto).toHaveBeenCalledWith('A')
    expect(callbacks.onDropped).not.toHaveBeenCalled()
  })

  it('clears the drag state on cancel', () => {
    const { hook } = setup()

    act(() => hook.result.current.onDragStart(startEvent('loose')))
    act(() => hook.result.current.onDragCancel())

    expect(hook.result.current.dragged).toEqual([])
  })

  it('ignores a drag that starts on an unknown row', () => {
    const { hook, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent('nope')))

    expect(hook.result.current.dragged).toEqual([])
    expect(callbacks.onSelectOnly).not.toHaveBeenCalled()
  })
})
