import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '#/mocks/server'
import * as api from '../api'
import type { Note } from '../model'
import { useCreateNote, useUpdateNote } from './useNotesQuery'
import { useNotesStore } from './useNotesStore'

afterEach(cleanup)

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['notes'], [])
  useNotesStore.getState().setActiveNoteId(null)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('note persistence', () => {
  it('saves the optimistic starter content, icon and favorite and replaces the temporary ID', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCreateNote(), { wrapper })
    let temporary: Note | undefined
    const unsubscribe = client.getQueryCache().subscribe(() => {
      const notes = client.getQueryData<Note[]>(['notes'])
      if (!temporary && notes?.length) temporary = notes[0]
    })
    let created!: Note
    await act(async () => {
      created = await result.current.mutateAsync({
        title: '<Example> & notes',
        icon: '🚀',
        isFavorite: true,
      })
    })
    unsubscribe()
    const saved = await api.fetchNote(created.id)
    expect(saved.content).toBe(temporary?.content)
    expect(saved.content).toBe(
      '<h1>&lt;Example&gt; &amp; notes</h1><p>Start writing here...</p>',
    )
    expect(saved.icon).toBe('🚀')
    expect(saved.isFavorite).toBe(true)
    expect(created.id).not.toBe(temporary?.id)
    expect(client.getQueryData(['notes'])).toEqual([created])
    expect(useNotesStore.getState().activeNoteId).toBe(created.id)
  })

  it('preserves explicitly empty content', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCreateNote(), { wrapper })
    await act(async () => {
      const created = await result.current.mutateAsync({ content: '' })
      expect((await api.fetchNote(created.id)).content).toBe('')
    })
  })

  it.each([false, true])(
    'rolls back failed creation without erasing other notes (selection changed: %s)',
    async (changeSelection) => {
      const { client, wrapper } = setup()
      const previous = await api.createNote({ title: 'Previous', content: '' })
      client.setQueryData(['notes'], [previous])
      useNotesStore.getState().setActiveNoteId(previous.id)
      server.use(
        http.post('/api/notes', () => {
          client.setQueryData<Note[]>(['notes'], (notes) => [
            ...(notes || []),
            { ...previous, id: 'unrelated' },
          ])
          if (changeSelection)
            useNotesStore.getState().setActiveNoteId('unrelated')
          return HttpResponse.json({ error: 'Save failed' }, { status: 500 })
        }),
      )
      const { result } = renderHook(() => useCreateNote(), { wrapper })
      await act(async () => {
        await expect(
          result.current.mutateAsync({ title: 'Failed' }),
        ).rejects.toThrow()
      })
      expect(
        client.getQueryData<Note[]>(['notes'])?.map((note) => note.id),
      ).toEqual([previous.id, 'unrelated'])
      expect(useNotesStore.getState().activeNoteId).toBe(
        changeSelection ? 'unrelated' : previous.id,
      )
    },
  )

  it('persists icon changes and both favorite values across reads', async () => {
    const { client, wrapper } = setup()
    const note = await api.createNote({ title: 'Update', content: '' })
    client.setQueryData(['notes'], [note])
    const { result } = renderHook(() => useUpdateNote(), { wrapper })
    for (const isFavorite of [true, false]) {
      act(() => result.current.updateNote(note.id, { icon: '🎯', isFavorite }))
      await waitFor(async () => {
        const saved = await api.fetchNote(note.id)
        expect(saved.icon).toBe('🎯')
        expect(saved.isFavorite).toBe(isFavorite)
      })
    }
  })
})
