import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import * as api from '../api'
import type { Folder, Note } from '../model'
import { useFoldersQuery, useMoveItems, useNotesQuery } from './useNotesQuery'

afterEach(cleanup)

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

// Creates a fresh tree through the mock API so tests do not depend on seed data.
async function seed() {
  const dest = await api.createFolder({ name: 'Dest' })
  const a = await api.createFolder({ name: 'A' })
  const b = await api.createNote({
    title: 'B',
    content: '<p>b body</p>',
    parentId: a.id,
    icon: '💡',
    isFavorite: true,
  })
  const loose = await api.createNote({ title: 'Loose', content: '<p>l</p>' })
  return { dest, a, b, loose }
}

async function load(client: QueryClient) {
  client.setQueryData(['folders'], await api.fetchFolders())
  client.setQueryData(['notes'], await api.fetchNotes())
}

const childrenOf = (id: string | null, folders: Folder[], notes: Note[]) => [
  ...folders.filter((f) => f.parentId === id).map((f) => f.name),
  ...notes.filter((n) => n.parentId === id).map((n) => n.title),
]

describe('useMoveItems', () => {
  it('moves items into a folder and persists the new parent', async () => {
    const { client, wrapper } = setup()
    const { dest, a, loose } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        items: [
          { id: a.id, type: 'folder' },
          { id: loose.id, type: 'note' },
        ],
        destinationId: dest.id,
      })
    })

    const folders = await api.fetchFolders()
    const notes = await api.fetchNotes()
    expect(folders.find((f) => f.id === a.id)?.parentId).toBe(dest.id)
    expect(notes.find((n) => n.id === loose.id)?.parentId).toBe(dest.id)
    expect(folders.find((f) => f.id === a.id)?.name).toBe('A')
  })

  it('moves an item back to the top level', async () => {
    const { client, wrapper } = setup()
    const { b } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        items: [{ id: b.id, type: 'note' }],
        destinationId: null,
      })
    })

    expect((await api.fetchNote(b.id)).parentId).toBeNull()
  })

  it('updates the cache optimistically before the server answers', async () => {
    const { client, wrapper } = setup()
    const { dest, loose } = await seed()
    await load(client)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('/api/hierarchy/move', async () => {
        await gate
        return HttpResponse.json({
          moved: { folders: [], notes: [] },
          created: { folders: [], notes: [] },
        })
      }),
    )
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    act(() => {
      result.current.mutate({
        items: [{ id: loose.id, type: 'note' }],
        destinationId: dest.id,
      })
    })

    await waitFor(() => {
      const notes = client.getQueryData<Note[]>(['notes']) || []
      expect(notes.find((n) => n.id === loose.id)?.parentId).toBe(dest.id)
    })
    release()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('leaves the tree unchanged when the server rejects the move', async () => {
    const { client, wrapper } = setup()
    const { dest, a, loose } = await seed()
    await load(client)
    const foldersBefore = client.getQueryData<Folder[]>(['folders'])
    const notesBefore = client.getQueryData<Note[]>(['notes'])
    server.use(
      http.post('/api/hierarchy/move', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({
          items: [
            { id: a.id, type: 'folder' },
            { id: loose.id, type: 'note' },
          ],
          destinationId: dest.id,
        })
        .catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    // Rollback plus the settled refetch must leave the original tree.
    await waitFor(() => {
      const notes = client.getQueryData<Note[]>(['notes']) || []
      expect(notes.find((n) => n.id === loose.id)?.parentId).toBeNull()
    })
    const folders = client.getQueryData<Folder[]>(['folders']) || []
    expect(folders.find((f) => f.id === a.id)?.parentId).toBeNull()
    expect(foldersBefore?.length).toBe(folders.length)
    expect(notesBefore?.length).toBe(
      (client.getQueryData<Note[]>(['notes']) || []).length,
    )
  })

  it('clones a selected item that sits inside another selected folder', async () => {
    const { client, wrapper } = setup()
    const { dest, a, b } = await seed()
    await load(client)
    const { result } = renderHook(() => useMoveItems(), { wrapper })

    let response!: Awaited<ReturnType<typeof api.moveItems>>
    await act(async () => {
      response = await result.current.mutateAsync({
        items: [
          { id: a.id, type: 'folder' },
          { id: b.id, type: 'note' },
        ],
        destinationId: dest.id,
      })
    })

    expect(response.created.notes).toHaveLength(1)
    const clone = response.created.notes[0]
    expect(clone.id).not.toBe(b.id)
    expect(clone.title).toBe('B (Copy 1)')
    expect(clone.content).toBe('<p>b body</p>')
    expect(clone.icon).toBe('💡')
    expect(clone.isFavorite).toBe(true)

    const folders = await api.fetchFolders()
    const notes = await api.fetchNotes()
    // One new direct entry per selected item: the moved A plus the clone of B.
    expect(childrenOf(dest.id, folders, notes).sort()).toEqual([
      'A',
      'B (Copy 1)',
    ])
    // The original B travelled with A.
    expect(notes.find((n) => n.id === b.id)?.parentId).toBe(a.id)
  })

  // Mounted query observers are what make a refetch actually happen, so these tests
  // render them next to the mutation and record the GET requests.
  function observe() {
    const gets: string[] = []
    const listener = ({ request }: { request: Request }) => {
      if (request.method === 'GET') gets.push(new URL(request.url).pathname)
    }
    server.events.on('request:start', listener)
    return {
      gets,
      stop: () => server.events.removeListener('request:start', listener),
    }
  }

  it('applies the response to the cache without refetching folders or notes', async () => {
    const { client, wrapper } = setup()
    const { dest, a, b } = await seed()
    const { result } = renderHook(
      () => ({
        move: useMoveItems(),
        notes: useNotesQuery(),
        folders: useFoldersQuery(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.notes.isSuccess).toBe(true)
      expect(result.current.folders.isSuccess).toBe(true)
    })
    const requests = observe()

    await act(async () => {
      await result.current.move.mutateAsync({
        items: [
          { id: a.id, type: 'folder' },
          { id: b.id, type: 'note' },
        ],
        destinationId: dest.id,
      })
    })
    // Give a wrongly-scheduled refetch time to fire before asserting there was none.
    await new Promise((resolve) => setTimeout(resolve, 50))
    requests.stop()

    expect(requests.gets).toEqual([])
    const notes = client.getQueryData<Note[]>(['notes']) || []
    const folders = client.getQueryData<Folder[]>(['folders']) || []
    expect(folders.find((f) => f.id === a.id)?.parentId).toBe(dest.id)
    expect(
      notes.some((n) => n.title === 'B (Copy 1)' && n.parentId === dest.id),
    ).toBe(true)
    expect(notes.find((n) => n.id === b.id)?.parentId).toBe(a.id)
  })

  it('refetches to resync after a failed move', async () => {
    const { client, wrapper } = setup()
    const { dest, loose } = await seed()
    const { result } = renderHook(
      () => ({
        move: useMoveItems(),
        notes: useNotesQuery(),
        folders: useFoldersQuery(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.notes.isSuccess).toBe(true)
      expect(result.current.folders.isSuccess).toBe(true)
    })
    server.use(
      http.post('/api/hierarchy/move', () =>
        HttpResponse.json(
          { error: 'destination folder not found' },
          { status: 404 },
        ),
      ),
    )
    const requests = observe()

    await act(async () => {
      await result.current.move
        .mutateAsync({
          items: [{ id: loose.id, type: 'note' }],
          destinationId: dest.id,
        })
        .catch(() => undefined)
    })
    await waitFor(() => expect(requests.gets.length).toBeGreaterThanOrEqual(2))
    requests.stop()

    expect(requests.gets.sort()).toEqual(['/api/folders', '/api/notes'])
    // The server's own message reaches the caller, not just "HTTP error".
    expect(result.current.move.error?.message).toBe(
      'destination folder not found',
    )
    const notes = client.getQueryData<Note[]>(['notes']) || []
    expect(notes.find((n) => n.id === loose.id)?.parentId).toBeNull()
  })
})
