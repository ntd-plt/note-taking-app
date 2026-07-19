import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Note, Folder } from '../model'
import { useNotesStore } from './useNotesStore'
import { debounce } from '@/shared/lib/debounce'
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

      const mapped = await api.updateNote(id, { title, content })
      if (currentNote) {
        mapped.icon = currentNote.icon
        mapped.isFavorite = currentNote.isFavorite
      }
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

export function useCreateNote() {
  const queryClient = useQueryClient()
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    mutationFn: async (newNote: Partial<Note>) => {
      const mapped = await api.createNote({
        title: newNote.title || 'Untitled Note',
        content: newNote.content || '',
        parentId: newNote.parentId || null,
      })
      mapped.icon = newNote.icon || '📄'
      mapped.isFavorite = newNote.isFavorite || false
      return mapped
    },
    onMutate: async (newNote) => {
      const generateUUID = () => {
        return crypto.randomUUID()
      }
      const id = newNote.id || generateUUID()
      const optimisticNote: Note = {
        id,
        title: newNote.title || 'Untitled Note',
        parentId: newNote.parentId || null,
        icon: newNote.icon || '📄',
        content:
          newNote.content ||
          `<h1>${newNote.title || 'Untitled Note'}</h1><p>Start writing here...</p>`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await queryClient.cancelQueries({ queryKey: ['notes'] })
      queryClient.setQueryData<Note[]>(['notes'], (old) => [
        ...(old || []),
        optimisticNote,
      ])
      setActiveNoteId(id)

      return { optimisticId: id }
    },
    onSuccess: (createdNote, _variables, context) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => {
        if (!old) return [createdNote]
        return old.map((n) => (n.id === context.optimisticId ? createdNote : n))
      })
      if (context.optimisticId) {
        setActiveNoteId(createdNote.id)
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
    mutationFn: async (noteToDup: Note) => {
      const mapped = await api.createNote({
        title: `${noteToDup.title} (Copy)`,
        content: noteToDup.content,
        parentId: noteToDup.parentId || null,
      })
      mapped.icon = noteToDup.icon || '📄'
      mapped.isFavorite = false
      return mapped
    },
    onSuccess: (newNote) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => [
        ...(old || []),
        newNote,
      ])
      setActiveNoteId(newNote.id)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
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
