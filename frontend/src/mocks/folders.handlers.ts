// src/mocks/folders.handlers.ts
import { http, HttpResponse, delay } from 'msw'
import type { Folder } from '#/widgets/note-editor/model'

// In-memory mock database for folders
let mockFolders: Folder[] = [
  {
    id: 'work-space',
    name: 'Work',
    parentId: null,
    icon: '💼',
    isExpanded: true,
    createdAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
  },
  {
    id: 'personal-space',
    name: 'Personal',
    parentId: null,
    icon: '🏠',
    isExpanded: true,
    createdAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
  },
  {
    id: 'nested-folder',
    name: 'Nested Subfolder',
    parentId: 'work-space',
    icon: '📁',
    isExpanded: false,
    createdAt: new Date('2026-05-31T09:10:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T09:10:00.000Z').toISOString(),
  },
]

export const foldersHandlers = [
  // GET all folders
  http.get('/api/folders', async () => {
    await delay(1500) // Simulate a slow network call (1.5s)
    return HttpResponse.json(mockFolders)
  }),

  // GET folder by ID
  http.get('/api/folders/:id', async ({ params }) => {
    const { id } = params
    await delay(800) // Simulate individual resolution delay (800ms)
    const folder = mockFolders.find((f) => f.id === id)
    if (!folder) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Folder Not Found',
      })
    }
    return HttpResponse.json(folder)
  }),

  // POST create a new folder
  http.post('/api/folders', async ({ request }) => {
    const body = (await request.json()) as Partial<Folder>
    const id = Math.random().toString(36).substring(2, 9)
    const newFolder: Folder = {
      id,
      name: body.name || 'Untitled Folder',
      parentId: body.parentId || null,
      icon: body.icon || '📁',
      isExpanded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockFolders.push(newFolder)
    return HttpResponse.json(newFolder)
  }),

  // PATCH update folder
  http.patch('/api/folders/:id', async ({ params, request }) => {
    const { id } = params
    const body = (await request.json()) as Partial<Folder>
    const index = mockFolders.findIndex((f) => f.id === id)
    if (index === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Folder Not Found',
      })
    }

    mockFolders[index] = {
      ...mockFolders[index],
      ...body,
      updatedAt: new Date().toISOString(),
    }

    return HttpResponse.json(mockFolders[index])
  }),

  // DELETE a folder
  http.delete('/api/folders/:id', ({ params }) => {
    const { id } = params
    const index = mockFolders.findIndex((f) => f.id === id)
    if (index === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Folder Not Found',
      })
    }
    const deleted = mockFolders[index]
    mockFolders = mockFolders.filter((f) => f.id !== id)
    return HttpResponse.json(deleted)
  }),
]
