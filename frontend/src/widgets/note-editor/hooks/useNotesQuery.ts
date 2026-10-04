import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Note, Folder } from '../model'
import { useNotesStore } from './useNotesStore'
import { debounce } from '@/shared/lib/debounce'
import { splitSelection } from '@/shared/lib/hierarchy'
import type { ItemRef } from '@/shared/lib/hierarchy'
import * as React from 'react'
import * as api from '../api'

// Queries
export function useNotesQuery() {
  return useQuery({
    queryKey: ['notes'],
    queryFn: () => api.fetchNotes(),
  })
}

export function useFoldersQuery() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => api.fetchFolders(),
  })
}

// Mutate Note (Optimistic Updates + Debounced Autosave)
export function useUpdateNote() {
  const queryClient = useQueryClient()
  const setSavingNoteId = useNotesStore((state) => state.setSavingNoteId)

  const mutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Note>
    }) => {
      const notes = queryClient.getQueryData<Note[]>(['notes']) || []
      const currentNote = notes.find((n) => n.id === id)
      const title =
        updates.title !== undefined
          ? updates.title
          : currentNote?.title || 'Untitled Note'
      const content =
        updates.content !== undefined
          ? updates.content
          : currentNote?.content || ''
      const icon =
        updates.icon !== undefined ? updates.icon : currentNote?.icon || '📄'

      const isFavorite =
        updates.isFavorite !== undefined
          ? updates.isFavorite
          : currentNote?.isFavorite || false

      const mapped = await api.updateNote(id, {
        title,
        icon,
        content,
        isFavorite,
      })
      return mapped
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  // Ref keeps debounced functions stable across renders
  const debouncedSyncsRef = React.useRef<
    Record<string, ReturnType<typeof debounce>>
  >({})

  const updateNote = React.useCallback(
    (id: string, updates: Partial<Note>) => {
      // 1. Optimistic update in cache instantly (snappy UI)
      queryClient.setQueryData<Note[]>(['notes'], (oldNotes) => {
        if (!oldNotes) return []
        return oldNotes.map((n) => (n.id === id ? { ...n, ...updates } : n))
      })

      // 2. Determine if we should debounce (content or title edits)
      if ('content' in updates || 'title' in updates) {
        setSavingNoteId(id)

        if (!(id in debouncedSyncsRef.current)) {
          debouncedSyncsRef.current[id] = debounce(
            async (upds: Partial<Note>) => {
              try {
                await mutation.mutateAsync({ id, updates: upds })
              } catch (err) {
                console.error('Failed to autosave note:', err)
              } finally {
                if (useNotesStore.getState().savingNoteId === id) {
                  setSavingNoteId(null)
                }
              }
            },
            1000,
          ) // 1-second debounce
        }

        debouncedSyncsRef.current[id](updates)
      } else {
        // Save icons/favorite instantly
        mutation.mutate({ id, updates })
      }
    },
    [queryClient, mutation, setSavingNoteId],
  )

  return { updateNote, isSaving: mutation.isPending }
}

function creationDefaults(newNote: Partial<Note>) {
  const title = newNote.title || 'Untitled Note'
  const escapedTitle = title
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return {
    title,
    content:
      newNote.content ?? `<h1>${escapedTitle}</h1><p>Start writing here...</p>`,
    parentId: newNote.parentId || null,
    icon: newNote.icon || '📄',
    isFavorite: newNote.isFavorite ?? false,
  }
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    mutationFn: async (newNote: Partial<Note>) => {
      const mapped = await api.createNote(creationDefaults(newNote))
      return mapped
    },
    onMutate: async (newNote) => {
      const generateUUID = () => {
        return crypto.randomUUID()
      }
      const id = newNote.id || generateUUID()
      const optimisticNote: Note = {
        id,
        ...creationDefaults(newNote),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previousActiveNoteId = useNotesStore.getState().activeNoteId
      queryClient.setQueryData<Note[]>(['notes'], (old) => [
        ...(old || []),
        optimisticNote,
      ])
      setActiveNoteId(id)

      return { optimisticId: id, previousActiveNoteId }
    },
    onSuccess: (createdNote, _variables, context) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => {
        if (!old) return [createdNote]
        return old.map((n) => (n.id === context.optimisticId ? createdNote : n))
      })
      if (useNotesStore.getState().activeNoteId === context.optimisticId) {
        setActiveNoteId(createdNote.id)
      }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      queryClient.setQueryData<Note[]>(['notes'], (old) =>
        (old || []).filter((note) => note.id !== context.optimisticId),
      )
      if (useNotesStore.getState().activeNoteId === context.optimisticId) {
        const notes = queryClient.getQueryData<Note[]>(['notes']) || []
        setActiveNoteId(
          notes.some((note) => note.id === context.previousActiveNoteId)
            ? context.previousActiveNoteId
            : null,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  const activeNoteId = useNotesStore((state) => state.activeNoteId)
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      queryClient.setQueryData<Note[]>(['notes'], (old) =>
        (old || []).filter((n) => n.id !== id),
      )

      if (activeNoteId === id) {
        const remaining = (previousNotes || []).filter((n) => n.id !== id)
        setActiveNoteId(remaining.length > 0 ? remaining[0].id : null)
      }

      return { previousNotes }
    },
    onError: (_err, _id, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes'], context.previousNotes)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDuplicateNote() {
  const queryClient = useQueryClient()
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    // Duplicates through the server, which names the copy "Title (Copy N)" and keeps
    // its content, icon and favorite flag, exactly like a clone made by a move.
    mutationFn: async (noteToDup: Note) => {
      const result = await api.duplicateItems([
        { id: noteToDup.id, type: 'note' },
      ])
      return result.created.notes[0]
    },
    // The response is the new note, so no refetch is needed.
    onSuccess: (newNote) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => {
        const notes = old || []
        return notes.some((n) => n.id === newNote.id)
          ? notes
          : [...notes, newNote]
      })
      setActiveNoteId(newNote.id)
    },
  })
}

// Duplicates a folder with everything inside it. The server names the copy
// "Name (Copy N)" and keeps the contents' names, exactly like a clone made by a move.
export function useDuplicateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (folderId: string) =>
      api.duplicateItems([{ id: folderId, type: 'folder' }]),
    // The response lists every created row, so no refetch is needed.
    onSuccess: (result) => {
      const addNew = <T extends { id: string }>(
        current: T[] | undefined,
        created: T[],
      ) => {
        if (!current) return current
        const known = new Set(current.map((row) => row.id))
        return [...current, ...created.filter((row) => !known.has(row.id))]
      }
      queryClient.setQueryData<Folder[]>(['folders'], (old) =>
        addNew(old, result.created.folders),
      )
      queryClient.setQueryData<Note[]>(['notes'], (old) =>
        addNew(old, result.created.notes),
      )
    },
  })
}

// Folders Mutations
export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newFolder: Partial<Folder>) => {
      const mapped = await api.createFolder({
        name: newFolder.name || 'Untitled Folder',
        parentId: newFolder.parentId || null,
      })
      mapped.icon = newFolder.icon || '📁'
      mapped.isExpanded = newFolder.isExpanded || false
      return mapped
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useUpdateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Folder>
    }) => {
      const folders = queryClient.getQueryData<Folder[]>(['folders']) || []
      const currentFolder = folders.find((f) => f.id === id)
      const name =
        updates.name !== undefined
          ? updates.name
          : currentFolder?.name || 'Untitled Folder'
      const parentFolderId =
        updates.parentId !== undefined
          ? updates.parentId
          : currentFolder?.parentId || null

      const mapped = await api.updateFolder(id, {
        name,
        parentId: parentFolderId,
      })
      if (currentFolder) {
        mapped.icon = currentFolder.icon
        mapped.isExpanded = currentFolder.isExpanded
      }
      return mapped
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      queryClient.setQueryData<Folder[]>(['folders'], (old) => {
        if (!old) return []
        return old.map((f) => (f.id === id ? { ...f, ...updates } : f))
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()
  const activeNoteId = useNotesStore((state) => state.activeNoteId)
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    mutationFn: (id: string) => api.deleteFolder(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      await queryClient.cancelQueries({ queryKey: ['notes'] })

      const previousFolders = queryClient.getQueryData<Folder[]>(['folders'])
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      // Recursively gather subfolders to delete
      const getFolderIdsToDelete = (
        folderId: string,
        list: Folder[],
        visited: Set<string> = new Set(),
      ): string[] => {
        if (visited.has(folderId)) {
          console.warn('Cycle detected during folder deletion path:', folderId)
          return []
        }
        visited.add(folderId)
        const childrenIds = list
          .filter((f) => f.parentId === folderId)
          .flatMap((f) => getFolderIdsToDelete(f.id, list, visited))
        return [folderId, ...childrenIds]
      }

      const folderIdsToDelete = getFolderIdsToDelete(id, previousFolders || [])

      queryClient.setQueryData<Folder[]>(['folders'], (old) =>
        (old || []).filter((f) => !folderIdsToDelete.includes(f.id)),
      )

      const remainingNotes = (previousNotes || []).filter(
        (n) => !n.parentId || !folderIdsToDelete.includes(n.parentId),
      )
      queryClient.setQueryData<Note[]>(['notes'], remainingNotes)

      // If active note was in deleted folders, change selection
      const isActiveDeleted = (previousNotes || []).some(
        (n) =>
          n.id === activeNoteId &&
          n.parentId &&
          folderIdsToDelete.includes(n.parentId),
      )
      if (isActiveDeleted) {
        setActiveNoteId(remainingNotes.length > 0 ? remainingNotes[0].id : null)
      }

      return { previousFolders, previousNotes }
    },
    onError: (_err, _id, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(['folders'], context.previousFolders)
      }
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes'], context.previousNotes)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

// Move selected items to a folder (or the top level when destinationId is null).
// Items that are not inside another selected folder move optimistically; clones
// only exist once the server answers, so they appear when its response is applied.
export function useMoveItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      items,
      destinationId,
    }: {
      items: ItemRef[]
      destinationId: string | null
    }) => api.moveItems(items, destinationId),
    onMutate: async ({ items, destinationId }) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      await queryClient.cancelQueries({ queryKey: ['notes'] })

      const previousFolders = queryClient.getQueryData<Folder[]>(['folders'])
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      const { moved } = splitSelection(
        items,
        previousFolders || [],
        previousNotes || [],
      )
      const movedFolderIds = new Set(
        moved.filter((i) => i.type === 'folder').map((i) => i.id),
      )
      const movedNoteIds = new Set(
        moved.filter((i) => i.type === 'note').map((i) => i.id),
      )

      if (previousFolders) {
        queryClient.setQueryData<Folder[]>(
          ['folders'],
          previousFolders.map((f) =>
            movedFolderIds.has(f.id) ? { ...f, parentId: destinationId } : f,
          ),
        )
      }
      if (previousNotes) {
        queryClient.setQueryData<Note[]>(
          ['notes'],
          previousNotes.map((n) =>
            movedNoteIds.has(n.id) ? { ...n, parentId: destinationId } : n,
          ),
        )
      }

      return { previousFolders, previousNotes }
    },
    // The response lists every moved and created row, so the cache is updated from it
    // directly. No refetch is needed on success.
    onSuccess: (result) => {
      const upsert = <T extends { id: string }>(
        current: T[] | undefined,
        moved: T[],
        created: T[],
      ) => {
        if (!current) return current
        const movedById = new Map(moved.map((row) => [row.id, row]))
        const known = new Set(current.map((row) => row.id))
        return [
          ...current.map((row) => movedById.get(row.id) ?? row),
          ...created.filter((row) => !known.has(row.id)),
        ]
      }
      queryClient.setQueryData<Folder[]>(['folders'], (old) =>
        upsert(old, result.moved.folders, result.created.folders),
      )
      queryClient.setQueryData<Note[]>(['notes'], (old) =>
        upsert(old, result.moved.notes, result.created.notes),
      )
    },
    // On failure, restore the tree and resync with the server in case it moved on.
    onError: (err, _vars, context) => {
      console.error('Failed to move items:', err)
      if (context?.previousFolders) {
        queryClient.setQueryData(['folders'], context.previousFolders)
      }
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes'], context.previousNotes)
      }
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

// Path resolution helper
export function useResolveFullPath() {
  const queryClient = useQueryClient()

  return React.useCallback(
    async (note: Note | undefined, folders: Folder[]): Promise<Folder[]> => {
      if (
        !note ||
        !note.parentId ||
        note.parentId === 'null' ||
        note.parentId === 'undefined'
      )
        return []

      const path: Folder[] = []
      let currentParentId: string | null = note.parentId
      const visited = new Set<string>()

      while (
        currentParentId &&
        currentParentId !== 'null' &&
        currentParentId !== 'undefined'
      ) {
        if (visited.has(currentParentId)) {
          console.warn(
            'Cycle detected in folder path resolution:',
            currentParentId,
          )
          break
        }
        visited.add(currentParentId)

        let folder = folders.find((f) => f.id === currentParentId)
        if (!folder) {
          try {
            folder = await queryClient.fetchQuery<Folder>({
              queryKey: ['folders', currentParentId],
              queryFn: () => api.fetchFolder(currentParentId!),
            })
          } catch (err) {
            console.error(
              `Failed to fetch parent folder ${currentParentId}:`,
              err,
            )
            break
          }
        }

        path.unshift(folder)
        currentParentId = folder.parentId
      }
      return path
    },
    [queryClient],
  )
}
