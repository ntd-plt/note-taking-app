import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import { resetMockItems } from '#/mocks/items.handlers'
import type { Item, NoteContent } from '#/shared/models'
import * as api from '../api'
import {
  useCreateItem,
  useDeleteItem,
  useDuplicateItem,
  useItemsQuery,
  useNoteContentQuery,
  useSaveNoteContent,
  useUpdateItem,
} from './useItems'
import { useItemsStore } from './useItemsStore'

afterEach(() => {
  cleanup()
  resetMockItems()
})

function setup(items: Item[] = []) {
  resetMockItems({ empty: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['items'], items)
  useItemsStore.getState().setActiveItemId(null)
  useItemsStore.getState().setSavingItemId(null)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('queries', () => {
  it('lists items without note content and loads a note body on its own', async () => {
    const { wrapper } = setup()
    resetMockItems()
    const { result } = renderHook(
      () => ({
        items: useItemsQuery(),
        content: useNoteContentQuery('getting-started'),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.items.data?.length).toBeGreaterThan(0)
      expect(result.current.content.data?.content).toContain('Welcome')
    })
    expect(result.current.items.data?.[0]).not.toHaveProperty('content')
  })

  it('does not fetch content without an id', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useNoteContentQuery(null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('creating items', () => {
  it('saves a note under the id it was shown with, with starter content, icon and favorite', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCreateItem(), { wrapper })
    let temporary: Item | undefined
    let temporaryContent: NoteContent | undefined
    const unsubscribe = client.getQueryCache().subscribe(() => {
      const items = client.getQueryData<Item[]>(['items'])
      if (!temporary && items?.length) {
        temporary = items[0]
        temporaryContent = client.getQueryData<NoteContent>([
          'item-content',
          items[0].id,
        ])
      }
    })
    let created!: Item
    await act(async () => {
      created = await result.current.mutateAsync({
        type: 'note',
        name: '<Example> & notes',
        icon: '🚀',
        isFavorite: true,
      })
    })
    unsubscribe()

    const starter =
      '<h1>&lt;Example&gt; &amp; notes</h1><p>Start writing here...</p>'
    expect((await api.fetchNoteContent(created.id)).content).toBe(starter)
    expect(temporaryContent?.content).toBe(starter)
    const saved = await api.fetchItem(created.id)
    expect(saved).toMatchObject({
      type: 'note',
      name: '<Example> & notes',
      icon: '🚀',
      isFavorite: true,
    })
    expect(temporary?.id).toBe(created.id)
    expect(client.getQueryData<Item[]>(['items'])?.map((i) => i.id)).toEqual([
      created.id,
    ])
    expect(useItemsStore.getState().activeItemId).toBe(created.id)
  })

  it('opens a new note by default, but not when asked to leave things as they are', async () => {
    const { wrapper } = setup()
    const folder = await api.createItem({ type: 'folder', name: 'Open' })
    useItemsStore.getState().setActiveItemId(folder.id)
    const { result } = renderHook(() => useCreateItem(), { wrapper })

    let quiet!: Item
    await act(async () => {
      quiet = await result.current.mutateAsync({
        type: 'note',
        name: 'Quiet',
        parentId: folder.id,
        activate: false,
      })
    })
    expect(quiet.parentId).toBe(folder.id)
    expect(useItemsStore.getState().activeItemId).toBe(folder.id)

    let loud!: Item
    await act(async () => {
      loud = await result.current.mutateAsync({ type: 'note', name: 'Loud' })
    })
    expect(useItemsStore.getState().activeItemId).toBe(loud.id)
  })

  it('preserves explicitly empty content', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCreateItem(), { wrapper })
    await act(async () => {
      const created = await result.current.mutateAsync({
        type: 'note',
        name: 'Blank',
        content: '',
      })
      expect((await api.fetchNoteContent(created.id)).content).toBe('')
    })
  })

  it('creates a folder without content and without opening it', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCreateItem(), { wrapper })
    let created!: Item
    await act(async () => {
      created = await result.current.mutateAsync({
        type: 'folder',
        name: 'Projects',
        parentId: null,
      })
    })

    expect(created).toMatchObject({
      type: 'folder',
      name: 'Projects',
      icon: '📁',
    })
    expect(useItemsStore.getState().activeItemId).toBeNull()
    expect(client.getQueryData(['item-content', created.id])).toBeUndefined()
    await expect(api.fetchNoteContent(created.id)).rejects.toThrow()
  })

  it('names unnamed items after their type', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCreateItem(), { wrapper })
    await act(async () => {
      const note = await result.current.mutateAsync({ type: 'note' })
      const folder = await result.current.mutateAsync({ type: 'folder' })
      expect(note.name).toBe('Untitled Note')
      expect(folder.name).toBe('Untitled Folder')
    })
  })

  it.each([false, true])(
    'rolls back failed creation without erasing other items (selection changed: %s)',
    async (changeSelection) => {
      const { client, wrapper } = setup()
      const previous = await api.createItem({
        type: 'note',
        name: 'Previous',
        content: '',
      })
      client.setQueryData(['items'], [previous])
      useItemsStore.getState().setActiveItemId(previous.id)
      server.use(
        http.post('/api/v1/items', () => {
          client.setQueryData<Item[]>(['items'], (items) => [
            ...(items || []),
            { ...previous, id: 'unrelated' },
          ])
          if (changeSelection)
            useItemsStore.getState().setActiveItemId('unrelated')
          return HttpResponse.json({ error: 'Save failed' }, { status: 500 })
        }),
      )
      const { result } = renderHook(() => useCreateItem(), { wrapper })
      await act(async () => {
        await expect(
          result.current.mutateAsync({ type: 'note', name: 'Failed' }),
        ).rejects.toThrow()
      })
      expect(client.getQueryData<Item[]>(['items'])?.map((i) => i.id)).toEqual([
        previous.id,
        'unrelated',
      ])
      expect(useItemsStore.getState().activeItemId).toBe(
        changeSelection ? 'unrelated' : previous.id,
      )
    },
  )
})

describe('editing items', () => {
  it('persists icon changes and both favorite values across reads', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({
      type: 'note',
      name: 'Update',
      content: '',
    })
    client.setQueryData(['items'], [note])
    const { result } = renderHook(() => useUpdateItem(), { wrapper })
    for (const isFavorite of [true, false]) {
      act(() => result.current.updateItem(note.id, { icon: '🎯', isFavorite }))
      await waitFor(async () => {
        const saved = await api.fetchItem(note.id)
        expect(saved.icon).toBe('🎯')
        expect(saved.isFavorite).toBe(isFavorite)
      })
    }
  })

  it('shows a rename at once but saves it once typing pauses', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({
      type: 'note',
      name: 'Old',
      content: '',
    })
    client.setQueryData(['items'], [note])
    const patches: unknown[] = []
    server.use(
      http.patch('/api/v1/items/:id', async ({ request, params }) => {
        patches.push(await request.json())
        const item = await api.fetchItem(params.id as string)
        return HttpResponse.json({
          id: item.id,
          type: item.type,
          name: 'Final title',
          updated_at: '2030-01-01T00:00:00.000Z',
        })
      }),
    )
    const { result } = renderHook(() => useUpdateItem(), { wrapper })

    act(() => result.current.updateItem(note.id, { name: 'F' }))
    act(() => result.current.updateItem(note.id, { name: 'Fin' }))
    act(() => result.current.updateItem(note.id, { name: '  Final title ' }))

    expect(client.getQueryData<Item[]>(['items'])?.[0].name).toBe(
      '  Final title ',
    )
    expect(useItemsStore.getState().savingItemId).toBe(note.id)
    expect(patches).toHaveLength(0)

    await waitFor(() => expect(patches).toHaveLength(1), { timeout: 3000 })
    expect(patches[0]).toEqual({ name: 'Final title' })
    await waitFor(() =>
      expect(useItemsStore.getState().savingItemId).toBeNull(),
    )
    const cached = client.getQueryData<Item[]>(['items'])![0]
    expect(cached.name).toBe('  Final title ')
    expect(cached.updatedAt).toBe('2030-01-01T00:00:00.000Z')
  })

  it('does not save a blank name', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({ type: 'note', name: 'Keep me' })
    client.setQueryData(['items'], [note])
    const patches: unknown[] = []
    server.use(
      http.patch('/api/v1/items/:id', async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    const { result } = renderHook(() => useUpdateItem(), { wrapper })

    act(() => result.current.updateItem(note.id, { name: '   ' }))

    await waitFor(
      () => expect(useItemsStore.getState().savingItemId).toBeNull(),
      {
        timeout: 3000,
      },
    )
    expect(patches).toHaveLength(0)
    expect((await api.fetchItem(note.id)).name).toBe('Keep me')
  })

  it('saves renames immediately with updateItemNow', async () => {
    const { client, wrapper } = setup()
    const folder = await api.createItem({ type: 'folder', name: 'Old' })
    client.setQueryData(['items'], [folder])
    const { result } = renderHook(() => useUpdateItem(), { wrapper })

    act(() => result.current.updateItemNow(folder.id, { name: 'New' }))

    await waitFor(async () =>
      expect((await api.fetchItem(folder.id)).name).toBe('New'),
    )
  })

  it('resyncs with the server when a save fails', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({ type: 'note', name: 'Server name' })
    client.setQueryData(['items'], [note])
    server.use(
      http.patch('/api/v1/items/:id', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    )
    const { result } = renderHook(
      () => ({ update: useUpdateItem(), items: useItemsQuery() }),
      { wrapper },
    )

    act(() => result.current.update.updateItemNow(note.id, { icon: '🔥' }))

    await waitFor(() => {
      expect(result.current.items.data?.[0].icon).toBe(note.icon)
    })
  })
})

describe('saving note content', () => {
  it('shows typing at once and saves the latest body once it pauses', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({
      type: 'note',
      name: 'Doc',
      content: '<p>v0</p>',
    })
    client.setQueryData(['items'], [note])
    const puts: unknown[] = []
    server.use(
      http.put('/api/v1/items/:id/content', async ({ request, params }) => {
        const body = (await request.json()) as { content: string }
        puts.push(body)
        return HttpResponse.json({
          item_id: params.id,
          content: body.content,
          updated_at: '2031-01-01T00:00:00.000Z',
        })
      }),
    )
    const { result } = renderHook(() => useSaveNoteContent(), { wrapper })

    act(() => result.current.saveContent(note.id, '<p>v1</p>'))
    act(() => result.current.saveContent(note.id, '<p>v2</p>'))

    expect(
      client.getQueryData<NoteContent>(['item-content', note.id])?.content,
    ).toBe('<p>v2</p>')
    expect(useItemsStore.getState().savingItemId).toBe(note.id)
    expect(puts).toHaveLength(0)

    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 3000 })
    expect(puts[0]).toEqual({ content: '<p>v2</p>' })
    await waitFor(() =>
      expect(useItemsStore.getState().savingItemId).toBeNull(),
    )
    expect(client.getQueryData<Item[]>(['items'])![0].updatedAt).toBe(
      '2031-01-01T00:00:00.000Z',
    )
  })

  it('stores the body on the server', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({
      type: 'note',
      name: 'Doc',
      content: '',
    })
    client.setQueryData(['items'], [note])
    const { result } = renderHook(() => useSaveNoteContent(), { wrapper })

    act(() => result.current.saveContent(note.id, '<p>saved</p>'))

    await waitFor(
      async () =>
        expect((await api.fetchNoteContent(note.id)).content).toBe(
          '<p>saved</p>',
        ),
      { timeout: 3000 },
    )
  })
})

describe('deleting items', () => {
  async function tree() {
    const folder = await api.createItem({ type: 'folder', name: 'Folder' })
    const sub = await api.createItem({
      type: 'folder',
      name: 'Sub',
      parentId: folder.id,
    })
    const deep = await api.createItem({
      type: 'note',
      name: 'Deep',
      parentId: sub.id,
    })
    const outside = await api.createItem({ type: 'note', name: 'Outside' })
    return { folder, sub, deep, outside }
  }

  it('removes a folder with everything inside it, locally and on the server', async () => {
    const { client, wrapper } = setup()
    const { folder, sub, deep, outside } = await tree()
    client.setQueryData(['items'], await api.fetchItems())
    const { result } = renderHook(() => useDeleteItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(folder.id)
    })

    expect(client.getQueryData<Item[]>(['items'])?.map((i) => i.id)).toEqual([
      outside.id,
    ])
    for (const id of [folder.id, sub.id, deep.id]) {
      await expect(api.fetchItem(id)).rejects.toThrow()
    }
    expect((await api.fetchItem(outside.id)).name).toBe('Outside')
  })

  it('opens another note when the open one is deleted along with its folder', async () => {
    const { client, wrapper } = setup()
    const { folder, deep, outside } = await tree()
    client.setQueryData(['items'], await api.fetchItems())
    useItemsStore.getState().setActiveItemId(deep.id)
    const { result } = renderHook(() => useDeleteItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(folder.id)
    })

    expect(useItemsStore.getState().activeItemId).toBe(outside.id)
  })

  it('leaves the open item alone when something else is deleted', async () => {
    const { client, wrapper } = setup()
    const { folder, outside } = await tree()
    client.setQueryData(['items'], await api.fetchItems())
    useItemsStore.getState().setActiveItemId(outside.id)
    const { result } = renderHook(() => useDeleteItem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(folder.id)
    })

    expect(useItemsStore.getState().activeItemId).toBe(outside.id)
  })

  it('puts everything back when the server refuses', async () => {
    const { client, wrapper } = setup()
    const { folder } = await tree()
    const all = await api.fetchItems()
    client.setQueryData(['items'], all)
    server.use(
      http.delete('/api/v1/items/:id', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useDeleteItem(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync(folder.id)).rejects.toThrow()
    })

    await waitFor(() =>
      expect(client.getQueryData<Item[]>(['items'])).toHaveLength(all.length),
    )
  })
})

describe('duplicating items', () => {
  it('adds the numbered copy of a note and opens it', async () => {
    const { client, wrapper } = setup()
    const note = await api.createItem({
      type: 'note',
      name: 'Plan',
      content: '<p>x</p>',
    })
    client.setQueryData(['items'], [note])
    const { result } = renderHook(() => useDuplicateItem(), { wrapper })

    let copy!: Item
    await act(async () => {
      copy = await result.current.mutateAsync(note.id)
    })

    expect(copy.name).toBe('Plan (Copy 1)')
    expect(client.getQueryData<Item[]>(['items'])?.map((i) => i.id)).toEqual([
      note.id,
      copy.id,
    ])
    expect(useItemsStore.getState().activeItemId).toBe(copy.id)
    expect((await api.fetchNoteContent(copy.id)).content).toBe('<p>x</p>')
  })

  it('copies a folder with everything inside it and refreshes the tree', async () => {
    const { wrapper } = setup()
    const folder = await api.createItem({ type: 'folder', name: 'Work' })
    const sub = await api.createItem({
      type: 'folder',
      name: 'Sub',
      parentId: folder.id,
    })
    await api.createItem({ type: 'note', name: 'Deep', parentId: sub.id })
    await api.createItem({ type: 'note', name: 'Top', parentId: folder.id })
    const { result } = renderHook(
      () => ({ items: useItemsQuery(), duplicate: useDuplicateItem() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toHaveLength(4))
    useItemsStore.getState().setActiveItemId(null)

    let copy!: Item
    await act(async () => {
      copy = await result.current.duplicate.mutateAsync(folder.id)
    })

    expect(copy.name).toBe('Work (Copy 1)')
    await waitFor(() => expect(result.current.items.data).toHaveLength(8))
    const items = result.current.items.data!
    const copiedChildren = items.filter((i) => i.parentId === copy.id)
    expect(copiedChildren.map((i) => i.name)).toEqual(['Sub', 'Top'])
    const copiedSub = copiedChildren.find((i) => i.name === 'Sub')!
    expect(
      items.filter((i) => i.parentId === copiedSub.id).map((i) => i.name),
    ).toEqual(['Deep'])
    expect(useItemsStore.getState().activeItemId).toBeNull()
  })

  it('names successive copies Copy 1, Copy 2 and never stacks suffixes', async () => {
    const { wrapper } = setup()
    const note = await api.createItem({ type: 'note', name: 'Plan' })
    const { result } = renderHook(() => useDuplicateItem(), { wrapper })

    const names: string[] = []
    await act(async () => {
      names.push((await result.current.mutateAsync(note.id)).name)
      names.push((await result.current.mutateAsync(note.id)).name)
      const second = (await api.fetchItems()).find(
        (i) => i.name === 'Plan (Copy 2)',
      )!
      names.push((await result.current.mutateAsync(second.id)).name)
    })

    expect(names).toEqual(['Plan (Copy 1)', 'Plan (Copy 2)', 'Plan (Copy 3)'])
  })
})
