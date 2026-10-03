import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import * as api from '../api'
import type { Folder, Note } from '../model'
import {
  useDuplicateFolder,
  useDuplicateNote,
  useFoldersQuery,
  useNotesQuery,
} from './useNotesQuery'
import { useNotesStore } from './useNotesStore'

afterEach(cleanup)

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  useNotesStore.getState().setActiveNoteId(null)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function mountHooks(wrapper: (props: { children: ReactNode }) => ReactNode) {
  return renderHook(
    () => ({ duplicate: useDuplicateNote(), notes: useNotesQuery() }),
    { wrapper },
  )
}

describe('useDuplicateNote', () => {
  it('copies the note next to the original as "Title (Copy N)"', async () => {
    const { client, wrapper } = setup()
    const folder = await api.createFolder({ name: 'Home' })
    const original = await api.createNote({
      title: 'Plan',
      content: '<p>plan body</p>',
      parentId: folder.id,
      icon: '🚀',
      isFavorite: true,
    })
    const { result } = mountHooks(wrapper)
    await waitFor(() => expect(result.current.notes.isSuccess).toBe(true))

    let first!: Note
    let second!: Note
    await act(async () => {
      first = await result.current.duplicate.mutateAsync(original)
    })
    await act(async () => {
      second = await result.current.duplicate.mutateAsync(original)
    })

    expect(first.title).toBe('Plan (Copy 1)')
    expect(second.title).toBe('Plan (Copy 2)')
    for (const copy of [first, second]) {
      expect(copy.id).not.toBe(original.id)
      expect(copy.parentId).toBe(folder.id)
      expect(copy.content).toBe('<p>plan body</p>')
      expect(copy.icon).toBe('🚀')
      expect(copy.isFavorite).toBe(true)
    }
    const cached = client.getQueryData<Note[]>(['notes']) || []
    expect(cached.map((n) => n.id)).toEqual(
      expect.arrayContaining([original.id, first.id, second.id]),
    )
    // The copy becomes the open note.
    expect(useNotesStore.getState().activeNoteId).toBe(second.id)
    // The server agrees with the cache.
    expect((await api.fetchNote(first.id)).title).toBe('Plan (Copy 1)')
  })

  it('does not refetch the notes after duplicating', async () => {
    const { wrapper } = setup()
    const original = await api.createNote({
      title: 'Quiet',
      content: '<p>q</p>',
    })
    const { result } = mountHooks(wrapper)
    await waitFor(() => expect(result.current.notes.isSuccess).toBe(true))
    const gets: string[] = []
    const listener = ({ request }: { request: Request }) => {
      if (request.method === 'GET') gets.push(new URL(request.url).pathname)
    }
    server.events.on('request:start', listener)

    await act(async () => {
      await result.current.duplicate.mutateAsync(original)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    server.events.removeListener('request:start', listener)

    expect(gets).toEqual([])
  })

  it('surfaces the server error and leaves the notes untouched', async () => {
    const { client, wrapper } = setup()
    const original = await api.createNote({
      title: 'Keep',
      content: '<p>k</p>',
    })
    const { result } = mountHooks(wrapper)
    await waitFor(() => expect(result.current.notes.isSuccess).toBe(true))
    const before = (client.getQueryData<Note[]>(['notes']) || []).length
    server.use(
      http.post('/api/hierarchy/duplicate', () =>
        HttpResponse.json({ error: 'note not found' }, { status: 404 }),
      ),
    )

    await act(async () => {
      await result.current.duplicate
        .mutateAsync(original)
        .catch(() => undefined)
    })

    await waitFor(() => expect(result.current.duplicate.isError).toBe(true))
    expect(result.current.duplicate.error?.message).toBe('note not found')
    expect((client.getQueryData<Note[]>(['notes']) || []).length).toBe(before)
  })
})

describe('duplicateItems', () => {
  it('copies a folder recursively beside the original', async () => {
    const parent = await api.createFolder({ name: 'Parent' })
    const docs = await api.createFolder({ name: 'Docs', parentId: parent.id })
    const sub = await api.createFolder({ name: 'Sub', parentId: docs.id })
    await api.createNote({
      title: 'In docs',
      content: '<p>1</p>',
      parentId: docs.id,
    })
    await api.createNote({
      title: 'In sub',
      content: '<p>2</p>',
      parentId: sub.id,
    })

    const result = await api.duplicateItems([{ id: docs.id, type: 'folder' }])

    expect(result.moved.folders.length + result.moved.notes.length).toBe(0)
    expect(result.created.folders).toHaveLength(2)
    expect(result.created.notes).toHaveLength(2)
    const [top, nested] = result.created.folders
    expect(top.name).toBe('Docs (Copy 1)')
    expect(top.parentId).toBe(parent.id)
    expect(nested.name).toBe('Sub')
    expect(nested.parentId).toBe(top.id)
    expect(result.created.notes.map((n) => n.title).sort()).toEqual([
      'In docs',
      'In sub',
    ])
  })

  it('rejects an unknown item', async () => {
    await expect(
      api.duplicateItems([{ id: 'does-not-exist', type: 'note' }]),
    ).rejects.toThrow('note not found')
  })
})

describe('useDuplicateFolder', () => {
  it('adds the copied folder tree to the cache without refetching', async () => {
    const { client, wrapper } = setup()
    const docs = await api.createFolder({ name: 'Archive' })
    const sub = await api.createFolder({ name: 'Sub', parentId: docs.id })
    await api.createNote({
      title: 'Top note',
      content: '<p>1</p>',
      parentId: docs.id,
    })
    await api.createNote({
      title: 'Deep note',
      content: '<p>2</p>',
      parentId: sub.id,
    })
    const { result } = renderHook(
      () => ({
        duplicate: useDuplicateFolder(),
        notes: useNotesQuery(),
        folders: useFoldersQuery(),
      }),
      { wrapper },
    )
    await waitFor(() => {
      expect(result.current.notes.isSuccess).toBe(true)
      expect(result.current.folders.isSuccess).toBe(true)
    })
    const foldersBefore = (client.getQueryData<Folder[]>(['folders']) || [])
      .length
    const notesBefore = (client.getQueryData<Note[]>(['notes']) || []).length
    const gets: string[] = []
    const listener = ({ request }: { request: Request }) => {
      if (request.method === 'GET') gets.push(new URL(request.url).pathname)
    }
    server.events.on('request:start', listener)

    await act(async () => {
      await result.current.duplicate.mutateAsync(docs.id)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    server.events.removeListener('request:start', listener)

    expect(gets).toEqual([])
    const folders = client.getQueryData<Folder[]>(['folders']) || []
    const notes = client.getQueryData<Note[]>(['notes']) || []
    expect(folders).toHaveLength(foldersBefore + 2)
    expect(notes).toHaveLength(notesBefore + 2)
    const copy = folders.find((f) => f.name === 'Archive (Copy 1)')
    expect(copy?.parentId).toBeNull()
    const nested = folders.find((f) => f.parentId === copy?.id)
    expect(nested?.name).toBe('Sub')
    expect(
      notes.filter((n) => n.parentId === copy?.id).map((n) => n.title),
    ).toEqual(['Top note'])
    expect(
      notes.filter((n) => n.parentId === nested?.id).map((n) => n.title),
    ).toEqual(['Deep note'])
  })

  it('surfaces the server error and leaves the cache untouched', async () => {
    const { client, wrapper } = setup()
    const docs = await api.createFolder({ name: 'Keep' })
    const { result } = renderHook(
      () => ({ duplicate: useDuplicateFolder(), folders: useFoldersQuery() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.folders.isSuccess).toBe(true))
    const before = (client.getQueryData<Folder[]>(['folders']) || []).length
    server.use(
      http.post('/api/hierarchy/duplicate', () =>
        HttpResponse.json({ error: 'folder not found' }, { status: 404 }),
      ),
    )

    await act(async () => {
      await result.current.duplicate.mutateAsync(docs.id).catch(() => undefined)
    })

    await waitFor(() => expect(result.current.duplicate.isError).toBe(true))
    expect(result.current.duplicate.error?.message).toBe('folder not found')
    expect((client.getQueryData<Folder[]>(['folders']) || []).length).toBe(
      before,
    )
  })
})
