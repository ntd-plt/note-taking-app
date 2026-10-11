import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { server } from '#/mocks/server'
import { resetMockItems } from '#/mocks/items.handlers'
import type { Item } from '#/shared/models'
import * as api from '../api'
import { useMoveItems } from './useItems'

afterEach(() => {
  cleanup()
  resetMockItems()
})

function setup() {
  resetMockItems({ empty: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

async function seed() {
  const dest = await api.createItem({ type: 'folder', name: 'Dest' })
  const a = await api.createItem({ type: 'folder', name: 'A' })
  const b = await api.createItem({
    type: 'note',
    name: 'B',
    content: '<p>b body</p>',
    parentId: a.id,
    icon: '💡',
    isFavorite: true,
  })
  const loose = await api.createItem({
    type: 'note',
    name: 'Loose',
    content: '<p>l</p>',
  })
  return { dest, a, b, loose }
}

async function load(client: QueryClient) {
  client.setQueryData(['items'], await api.fetchItems())
}

describe('useMoveItems', () => {
  it('moves items into a folder and persists the new parent', async () => {
    const { client, wrapper } = setup()
    const { dest, a, loose } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        itemIds: [a.id, loose.id],
        destinationId: dest.id,
      })
    })

    const items = await api.fetchItems()
    expect(items.find((i) => i.id === a.id)?.parentId).toBe(dest.id)
    expect(items.find((i) => i.id === loose.id)?.parentId).toBe(dest.id)
    expect(items.find((i) => i.id === a.id)?.name).toBe('A')
  })

  it('moves an item back to the top level', async () => {
    const { client, wrapper } = setup()
    const { b } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ itemIds: [b.id], destinationId: null })
    })

    expect((await api.fetchItem(b.id)).parentId).toBeNull()
  })

  it('takes a folder together with its contents and creates nothing', async () => {
    const { client, wrapper } = setup()
    const { dest, a, b } = await seed()
    await load(client)
    const before = (await api.fetchItems()).length
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        itemIds: [a.id],
        destinationId: dest.id,
      })
    })

    const items = await api.fetchItems()
    expect(items).toHaveLength(before)
    const moved = items.find((i) => i.id === b.id)!
    expect(moved.parentId).toBe(a.id)
    expect(moved.icon).toBe('💡')
    expect(moved.isFavorite).toBe(true)
    expect((await api.fetchNoteContent(b.id)).content).toBe('<p>b body</p>')
  })

  it('shows the move in the tree before the server answers', async () => {
    const { client, wrapper } = setup()
    const { dest, loose } = await seed()
    await load(client)
    server.use(
      http.patch('/api/v1/items', async () => {
        await delay(150)
        return HttpResponse.json([
          { ...loose, parent_id: dest.id, user_id: 'u', is_favorite: false },
        ])
      }),
    )
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    act(() => {
      result.current.mutate({ itemIds: [loose.id], destinationId: dest.id })
    })

    await waitFor(() => {
      const cached = client.getQueryData<Item[]>(['items'])!
      expect(cached.find((i) => i.id === loose.id)?.parentId).toBe(dest.id)
    })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('restores the tree and reports the error when the server refuses', async () => {
    const { client, wrapper } = setup()
    const { a, b } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ itemIds: [a.id], destinationId: b.id }),
      ).rejects.toThrow('destination must be a folder')
    })

    expect(
      client.getQueryData<Item[]>(['items'])?.find((i) => i.id === a.id)
        ?.parentId,
    ).toBeNull()
    expect((await api.fetchItem(a.id)).parentId).toBeNull()
  })

  it('rejects a move into the folder itself', async () => {
    const { client, wrapper } = setup()
    const { a } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ itemIds: [a.id], destinationId: a.id }),
      ).rejects.toThrow(/itself or one of its descendants/)
    })
    expect((await api.fetchItem(a.id)).parentId).toBeNull()
  })
})
