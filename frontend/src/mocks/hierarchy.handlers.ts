// src/mocks/hierarchy.handlers.ts
import { http, HttpResponse } from 'msw'
import type { Folder, Note } from '#/widgets/note-editor/model'
import {
  getInvalidDropTargetIds,
  nextCloneName,
  splitSelection,
} from '#/shared/lib/hierarchy'
import type { ItemRef } from '#/shared/lib/hierarchy'
import { folderStore, toBackendFolderShape } from './folders.handlers'
import { noteStore, toBackendNoteShape } from './notes.handlers'

const error = (status: number, message: string) =>
  HttpResponse.json({ error: message }, { status })

interface Result {
  moved: { folders: Folder[]; notes: Note[] }
  created: { folders: Folder[]; notes: Note[] }
}

const emptyResult = (): Result => ({
  moved: { folders: [], notes: [] },
  created: { folders: [], notes: [] },
})

const respond = (result: Result) =>
  HttpResponse.json({
    moved: {
      folders: result.moved.folders.map(toBackendFolderShape),
      notes: result.moved.notes.map(toBackendNoteShape),
    },
    created: {
      folders: result.created.folders.map(toBackendFolderShape),
      notes: result.created.notes.map(toBackendNoteShape),
    },
  })

const itemExists = (item: ItemRef) =>
  item.type === 'folder'
    ? folderStore.all().some((f) => f.id === item.id)
    : noteStore.all().some((n) => n.id === item.id)

// Copies a note into `parentId` under `title`. Shared by moves and duplicates, like the
// backend's clone logic.
function cloneNote(
  source: Note,
  parentId: string | null,
  title: string,
  now: string,
  result: Result,
) {
  const copy: Note = {
    ...source,
    id: crypto.randomUUID(),
    parentId,
    title,
    createdAt: now,
    updatedAt: now,
  }
  noteStore.add(copy)
  result.created.notes.push(copy)
}

// Copies a folder and everything inside it. Only the top folder takes `name`.
function cloneFolderTree(
  source: Folder,
  parentId: string | null,
  name: string,
  now: string,
  result: Result,
) {
  // Read the children before adding the copy so new rows are never copied again.
  const kids = folderStore.all().filter((f) => f.parentId === source.id)
  const kidNotes = noteStore.all().filter((n) => n.parentId === source.id)
  const copy: Folder = {
    ...source,
    id: crypto.randomUUID(),
    parentId,
    name,
    isExpanded: false,
    createdAt: now,
    updatedAt: now,
  }
  folderStore.add(copy)
  result.created.folders.push(copy)
  for (const kid of kids) cloneFolderTree(kid, copy.id, kid.name, now, result)
  for (const kidNote of kidNotes) {
    cloneNote(kidNote, copy.id, kidNote.title, now, result)
  }
}

// POST move items and POST duplicate items. Simplified stand-ins for the backend: they
// apply the same moved/cloned split and "(Copy N)" naming, but not the row caps.
export const hierarchyHandlers = [
  http.post('/api/hierarchy/move', async ({ request }) => {
    const body = (await request.json()) as {
      items: ItemRef[]
      destination_folder_id: string | null
    }
    const folders = folderStore.all()
    const notes = noteStore.all()
    const destinationId = body.destination_folder_id ?? null

    for (const item of body.items) {
      if (!itemExists(item)) return error(404, `${item.type} not found`)
    }
    if (destinationId !== null) {
      if (!folders.some((f) => f.id === destinationId)) {
        return error(404, 'destination folder not found')
      }
      if (getInvalidDropTargetIds(body.items, folders).has(destinationId)) {
        return error(
          400,
          'cannot move a folder into itself or one of its descendants',
        )
      }
    }

    const { moved, cloned } = splitSelection(body.items, folders, notes)
    const now = new Date().toISOString()

    // Names taken at the destination: current children plus arriving items.
    const takenFolders = new Set(
      folders.filter((f) => f.parentId === destinationId).map((f) => f.name),
    )
    const takenNotes = new Set(
      notes.filter((n) => n.parentId === destinationId).map((n) => n.title),
    )
    for (const item of moved) {
      if (item.type === 'folder') {
        takenFolders.add(folders.find((f) => f.id === item.id)!.name)
      } else {
        takenNotes.add(notes.find((n) => n.id === item.id)!.title)
      }
    }

    const result = emptyResult()
    for (const item of moved) {
      const target =
        item.type === 'folder'
          ? folders.find((f) => f.id === item.id)!
          : notes.find((n) => n.id === item.id)!
      target.parentId = destinationId
      target.updatedAt = now
      if (item.type === 'folder') result.moved.folders.push(target as Folder)
      else result.moved.notes.push(target as Note)
    }

    for (const item of cloned) {
      if (item.type === 'folder') {
        const source = folders.find((f) => f.id === item.id)!
        cloneFolderTree(
          source,
          destinationId,
          nextCloneName(source.name, takenFolders),
          now,
          result,
        )
      } else {
        const source = notes.find((n) => n.id === item.id)!
        cloneNote(
          source,
          destinationId,
          nextCloneName(source.title, takenNotes),
          now,
          result,
        )
      }
    }

    return respond(result)
  }),

  // Each item is copied next to itself, in its own parent.
  http.post('/api/hierarchy/duplicate', async ({ request }) => {
    const body = (await request.json()) as { items: ItemRef[] }
    for (const item of body.items) {
      if (!itemExists(item)) return error(404, `${item.type} not found`)
    }

    const now = new Date().toISOString()
    const result = emptyResult()
    const seen = new Set<string>()
    // Names taken per parent and type, so copies made in one request stay distinct.
    const taken = new Map<string, Set<string>>()
    const namesIn = (parentId: string | null, type: ItemRef['type']) => {
      const key = `${type}:${parentId}`
      let names = taken.get(key)
      if (!names) {
        names = new Set(
          type === 'folder'
            ? folderStore
                .all()
                .filter((f) => f.parentId === parentId)
                .map((f) => f.name)
            : noteStore
                .all()
                .filter((n) => n.parentId === parentId)
                .map((n) => n.title),
        )
        taken.set(key, names)
      }
      return names
    }

    for (const item of body.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      if (item.type === 'folder') {
        const source = folderStore.all().find((f) => f.id === item.id)!
        const name = nextCloneName(
          source.name,
          namesIn(source.parentId, 'folder'),
        )
        cloneFolderTree(source, source.parentId, name, now, result)
      } else {
        const source = noteStore.all().find((n) => n.id === item.id)!
        const title = nextCloneName(
          source.title,
          namesIn(source.parentId, 'note'),
        )
        cloneNote(source, source.parentId, title, now, result)
      }
    }

    return respond(result)
  }),
]
