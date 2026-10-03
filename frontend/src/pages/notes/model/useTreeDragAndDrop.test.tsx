import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import type { Folder, Note } from '#/widgets/note-editor/model'
import type { ItemRef } from '#/shared/lib/hierarchy'
import { ROOT_DROP_ID } from './treeDnd'
import { useTreeDragAndDrop } from './useTreeDragAndDrop'

afterEach(cleanup)

const folder = (id: string, parentId: string | null = null): Folder => ({
  id,
  name: id,
  parentId,
})
const note = (id: string, parentId: string | null = null): Note => ({
  id,
  title: id,
  content: '',
  parentId,
})
const f = (id: string): ItemRef => ({ id, type: 'folder' })
const n = (id: string): ItemRef => ({ id, type: 'note' })

// dest, A { B (folder) { deep }, in-a }, loose
const folders = [folder('dest'), folder('A'), folder('B', 'A')]
const notes = [note('in-a', 'A'), note('deep', 'B'), note('loose')]

const startEvent = (ref: ItemRef) =>
  ({ active: { data: { current: ref } } }) as unknown as DragStartEvent
const overEvent = (id: string) => ({ over: { id } }) as unknown as DragOverEvent
const endEvent = (id: string | null) =>
  ({ over: id === null ? null : { id } }) as unknown as DragEndEvent

function setup(selection: ItemRef[] = []) {
  const requests: Array<{
    items: ItemRef[]
    destination_folder_id: string | null
  }> = []
  server.use(
    http.post('/api/hierarchy/move', async ({ request }) => {
      requests.push((await request.json()) as (typeof requests)[number])
      return HttpResponse.json({
        moved: { folders: [], notes: [] },
        created: { folders: [], notes: [] },
      })
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['folders'], folders)
  client.setQueryData(['notes'], notes)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const callbacks = {
    onSelectOnly: vi.fn(),
    onDropInto: vi.fn(),
    onDropped: vi.fn(),
  }
  const hook = renderHook(
    () => useTreeDragAndDrop({ folders, notes, selection, ...callbacks }),
    { wrapper },
  )
  return { hook, requests, callbacks }
}

describe('useTreeDragAndDrop', () => {
  it('moves the dragged row into the folder it is dropped on', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({
      items: [n('loose')],
      destination_folder_id: 'dest',
    })
    expect(callbacks.onDropInto).toHaveBeenCalledWith('dest')
    expect(callbacks.onDropped).toHaveBeenCalled()
  })

  it('drags only the row when it is not part of the selection', () => {
    const { hook, callbacks } = setup([n('in-a')])

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))

    expect(callbacks.onSelectOnly).toHaveBeenCalledWith([n('loose')])
    expect(hook.result.current.dragged).toEqual([n('loose')])
  })

  it('drags the whole selection when the grabbed row belongs to it', async () => {
    const selection = [f('A'), n('in-a'), n('loose')]
    const { hook, requests, callbacks } = setup(selection)

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))
    expect(callbacks.onSelectOnly).not.toHaveBeenCalled()
    expect(hook.result.current.dragged).toEqual(selection)
    act(() => hook.result.current.onDragEnd(endEvent('dest')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].items).toEqual(selection)
  })

  it('moves to the top level when dropped on the tree area', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent(f('B'))))
    act(() => hook.result.current.onDragOver(overEvent(ROOT_DROP_ID)))
    expect(hook.result.current.dropOnRoot).toBe(true)
    act(() => hook.result.current.onDragEnd(endEvent(ROOT_DROP_ID)))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].destination_folder_id).toBeNull()
    expect(callbacks.onDropInto).toHaveBeenCalledWith(null)
  })

  it("treats a drop on a note as a drop into that note's folder", async () => {
    const { hook, requests } = setup()

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))
    act(() => hook.result.current.onDragEnd(endEvent('in-a')))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].destination_folder_id).toBe('A')
  })

  it('highlights the folder under the pointer only while it is a valid target', () => {
    const { hook } = setup()

    act(() => hook.result.current.onDragStart(startEvent(f('A'))))
    act(() => hook.result.current.onDragOver(overEvent('dest')))
    expect(hook.result.current.dropFolderId).toBe('dest')

    act(() => hook.result.current.onDragOver(overEvent('B')))
    expect(hook.result.current.dropFolderId).toBeNull()
    expect(hook.result.current.dropOnRoot).toBe(false)
  })

  it('ignores drops onto the dragged folder or its descendants', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent(f('A'))))
    expect([...hook.result.current.invalidTargetIds].sort()).toEqual(['A', 'B'])
    act(() => hook.result.current.onDragEnd(endEvent('B')))
    act(() => hook.result.current.onDragStart(startEvent(f('A'))))
    act(() => hook.result.current.onDragEnd(endEvent('deep')))

    // Give any wrongly-sent request time to arrive before asserting none did.
    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(callbacks.onDropped).not.toHaveBeenCalled()
  })

  it('does nothing when dropped outside any target', async () => {
    const { hook, requests } = setup()

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))
    act(() => hook.result.current.onDragEnd(endEvent(null)))

    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(hook.result.current.dragged).toEqual([])
  })

  it('skips the request when nothing would change', async () => {
    const { hook, requests, callbacks } = setup()

    act(() => hook.result.current.onDragStart(startEvent(n('in-a'))))
    act(() => hook.result.current.onDragEnd(endEvent('A')))

    await new Promise((r) => setTimeout(r, 50))
    expect(requests).toHaveLength(0)
    expect(callbacks.onDropInto).toHaveBeenCalledWith('A')
    expect(callbacks.onDropped).not.toHaveBeenCalled()
  })

  it('clears the drag state on cancel', () => {
    const { hook } = setup()

    act(() => hook.result.current.onDragStart(startEvent(n('loose'))))
    act(() => hook.result.current.onDragCancel())

    expect(hook.result.current.dragged).toEqual([])
  })
})
