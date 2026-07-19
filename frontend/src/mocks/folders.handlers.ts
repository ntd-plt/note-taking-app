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

const toBackendFolderShape = (f: Folder) => ({
  id: f.id,
  name: f.name,
  parent_folder_id: f.parentId,
  icon: f.icon,
  isExpanded: f.isExpanded,
  created_at: f.createdAt,
  updated_at: f.updatedAt,
})

export const foldersHandlers = [
  // GET all folders
  http.get('/api/folders', async () => {
    return HttpResponse.json(mockFolders.map(toBackendFolderShape))
  }),

  // GET folder by ID
  http.get('/api/folders/:id', async ({ params }) => {
    const { id } = params
    const folder = mockFolders.find((f) => f.id === id)
    if (!folder) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Folder Not Found',
      })
    }
    return HttpResponse.json(toBackendFolderShape(folder))
  }),

  // POST create a new folder
  http.post('/api/folders', async ({ request }) => {
    const body = (await request.json()) as any
    const id = Math.random().toString(36).substring(2, 9)
    const newFolder: Folder = {
      id,
      name: body.name || 'Untitled Folder',
      parentId: body.parent_folder_id || null,
      icon: body.icon || '📁',
      isExpanded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockFolders.push(newFolder)
    return HttpResponse.json(toBackendFolderShape(newFolder))
  }),

  // PUT update folders (batch update)
  http.put('/api/folders', async ({ request }) => {
    const body = (await request.json()) as { folders: Array<any> }
    const updatedFolders: Folder[] = []
    for (const folderReq of body.folders) {
      const index = mockFolders.findIndex((f) => f.id === folderReq.id)
      if (index !== -1) {
        mockFolders[index] = {
          ...mockFolders[index],
          name:
            folderReq.name !== undefined
              ? folderReq.name
              : mockFolders[index].name,
          parentId:
            folderReq.parent_folder_id !== undefined
              ? folderReq.parent_folder_id
              : mockFolders[index].parentId,
          updatedAt: new Date().toISOString(),
        }
        updatedFolders.push(mockFolders[index])
      }
    }
    return HttpResponse.json(updatedFolders.map(toBackendFolderShape))
  }),

  // DELETE folders (batch delete)
  http.delete('/api/folders', async ({ request }) => {
    const body = (await request.json()) as { ids: string[] }
    mockFolders = mockFolders.filter((f) => !body.ids.includes(f.id))
    return HttpResponse.json({ message: 'folders deleted successfully' })
  }),
]
