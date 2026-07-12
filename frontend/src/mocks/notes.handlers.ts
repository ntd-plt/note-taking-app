// src/mocks/notes.handlers.ts
import { http, HttpResponse, delay } from 'msw'
import type { Note } from '#/widgets/note-editor/model'
import initialNotes from '#/widgets/note-editor/data/initialNotes'

// In-memory mock database for notes, seeded with initialNotes
let mockNotes: Note[] = [...initialNotes]

export const notesHandlers = [
  // GET all notes
  http.get('/api/notes', () => {
    return HttpResponse.json(mockNotes)
  }),

  // GET note by ID
  http.get('/api/notes/:id', ({ params }) => {
    const { id } = params
    const note = mockNotes.find((n) => n.id === id)
    if (!note) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Note Not Found',
      })
    }
    return HttpResponse.json(note)
  }),

  // POST create a new note
  http.post('/api/notes', async ({ request }) => {
    const body = (await request.json()) as Partial<Note>
    const id = body.id || Math.random().toString(36).substring(2, 9)
    const newNote: Note = {
      id,
      title: body.title || 'Untitled Note',
      parentId: body.parentId || null,
      icon: body.icon || '📄',
      content:
        body.content ||
        `<h1>${body.title || 'Untitled Note'}</h1><p>Start writing here...</p>`,
      isFavorite: body.isFavorite || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockNotes.push(newNote)
    return HttpResponse.json(newNote)
  }),

  // PATCH update note
  http.patch('/api/notes/:id', async ({ params, request }) => {
    const { id } = params
    await delay(1200) // Simulate a slight network delay (1.2s)
    const body = (await request.json()) as Partial<Note>
    const index = mockNotes.findIndex((n) => n.id === id)
    if (index === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Note Not Found',
      })
    }

    mockNotes[index] = {
      ...mockNotes[index],
      ...body,
      updatedAt: new Date().toISOString(),
    }

    return HttpResponse.json(mockNotes[index])
  }),

  // DELETE a note
  http.delete('/api/notes/:id', ({ params }) => {
    const { id } = params
    const index = mockNotes.findIndex((n) => n.id === id)
    if (index === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Note Not Found',
      })
    }
    const deleted = mockNotes[index]
    mockNotes = mockNotes.filter((n) => n.id !== id)
    return HttpResponse.json(deleted)
  }),
]
