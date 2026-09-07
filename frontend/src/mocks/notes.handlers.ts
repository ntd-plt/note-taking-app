// src/mocks/notes.handlers.ts
import { http, HttpResponse } from 'msw'
import type { Note } from '#/widgets/note-editor/model'
import initialNotes from './initialNotes'

// In-memory mock database for notes, seeded with initialNotes
let mockNotes: Note[] = [...initialNotes]

const toBackendNoteShape = (n: Note) => ({
  id: n.id,
  title: n.title,
  content: n.content,
  folder_id: n.parentId,
  is_favorite: n.isFavorite,
  icon: n.icon,
  created_at: n.createdAt,
  updated_at: n.updatedAt,
})

export const notesHandlers = [
  // GET all notes
  http.get('/api/notes', () => {
    return HttpResponse.json(mockNotes.map(toBackendNoteShape))
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
    return HttpResponse.json(toBackendNoteShape(note))
  }),

  // POST create a new note
  http.post('/api/notes', async ({ request }) => {
    const body = (await request.json()) as any
    const id = body.id || crypto.randomUUID()
    const newNote: Note = {
      id,
      title: body.title || 'Untitled Note',
      parentId: body.folder_id || null,
      icon: body.icon || '📄',
      content: body.content ?? '',
      isFavorite: body.is_favorite ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockNotes.push(newNote)
    return HttpResponse.json(toBackendNoteShape(newNote), { status: 201 })
  }),

  // PUT update notes (batch update)
  http.put('/api/notes', async ({ request }) => {
    const body = (await request.json()) as { notes: Array<any> }
    const updatedNotes: Note[] = []
    for (const noteReq of body.notes) {
      const index = mockNotes.findIndex((n) => n.id === noteReq.id)
      if (index !== -1) {
        mockNotes[index] = {
          ...mockNotes[index],
          icon: noteReq.icon ?? mockNotes[index].icon,
          isFavorite: noteReq.is_favorite ?? mockNotes[index].isFavorite,
          title:
            noteReq.title !== undefined
              ? noteReq.title
              : mockNotes[index].title,
          content:
            noteReq.content !== undefined
              ? noteReq.content
              : mockNotes[index].content,
          parentId:
            noteReq.folder_id !== undefined
              ? noteReq.folder_id
              : mockNotes[index].parentId,
          updatedAt: new Date().toISOString(),
        }
        updatedNotes.push(mockNotes[index])
      }
    }
    return HttpResponse.json(updatedNotes.map(toBackendNoteShape))
  }),

  // DELETE notes (batch delete)
  http.delete('/api/notes', async ({ request }) => {
    const body = (await request.json()) as { ids: string[] }
    mockNotes = mockNotes.filter((n) => !body.ids.includes(n.id))
    return HttpResponse.json({ message: 'notes deleted successfully' })
  }),
]
