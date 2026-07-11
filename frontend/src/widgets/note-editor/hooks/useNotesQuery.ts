import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { Note, Folder } from '../model'
import { useNotesStore } from './useNotesStore'
import { debounce } from '@/shared/lib/debounce'
import * as React from 'react'

// Queries
export function useNotesQuery() {
  return useQuery({
    queryKey: ['notes'],
    queryFn: () => apiClient.get<Note[]>('/api/notes'),
  })
}

export function useFoldersQuery() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => apiClient.get<Folder[]>('/api/folders'),
  })
}

// Mutate Note (Optimistic Updates + Debounced Autosave)
export function useUpdateNote() {
  const queryClient = useQueryClient()
  const setSavingNoteId = useNotesStore((state) => state.setSavingNoteId)

  const mutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Note> }) =>
      apiClient.patch<Note>(`/api/notes/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })

  // Ref keeps debounced functions stable across renders
  const debouncedSyncsRef = React.useRef<Record<string, ReturnType<typeof debounce>>>({})

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

        if (!debouncedSyncsRef.current[id]) {
          debouncedSyncsRef.current[id] = debounce(async (upds: Partial<Note>) => {
            try {
              await mutation.mutateAsync({ id, updates: upds })
            } catch (err) {
              console.error('Failed to autosave note:', err)
            } finally {
              if (useNotesStore.getState().savingNoteId === id) {
                setSavingNoteId(null)
              }
            }
          }, 1000) // 1-second debounce
        }

        debouncedSyncsRef.current[id](updates)
      } else {
        // Save icons/favorite instantly
        mutation.mutate({ id, updates })
      }
    },
    [queryClient, mutation, setSavingNoteId]
  )

  return { updateNote, isSaving: mutation.isPending }
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)

  return useMutation({
    mutationFn: (newNote: Partial<Note>) => apiClient.post<Note>('/api/notes', newNote),
    onMutate: async (newNote) => {
      const id = newNote.id || Math.random().toString(36).substring(2, 9)
      const optimisticNote: Note = {
        id,
        title: newNote.title || 'Untitled Note',
        parentId: newNote.parentId || null,
        icon: newNote.icon || '📄',
        content: newNote.content || `<h1>${newNote.title || 'Untitled Note'}</h1><p>Start writing here...</p>`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await queryClient.cancelQueries({ queryKey: ['notes'] })
      queryClient.setQueryData<Note[]>(['notes'], (old) => [...(old || []), optimisticNote])
      setActiveNoteId(id)

      return { optimisticId: id }
    },
    onSuccess: (createdNote, _variables, context) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => {
        if (!old) return [createdNote]
        return old.map((n) => (n.id === context?.optimisticId ? createdNote : n))
      })
      if (context?.optimisticId) {
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
    mutationFn: (id: string) => apiClient.delete(`/api/notes/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] })
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      queryClient.setQueryData<Note[]>(['notes'], (old) => (old || []).filter((n) => n.id !== id))

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
    mutationFn: (noteToDup: Note) => {
      const newId = Math.random().toString(36).substring(2, 9)
      const duplicatedNote: Note = {
        ...noteToDup,
        id: newId,
        title: `${noteToDup.title} (Copy)`,
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return apiClient.post<Note>('/api/notes', duplicatedNote)
    },
    onSuccess: (newNote) => {
      queryClient.setQueryData<Note[]>(['notes'], (old) => [...(old || []), newNote])
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
    mutationFn: (newFolder: Partial<Folder>) => apiClient.post<Folder>('/api/folders', newFolder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    },
  })
}

export function useUpdateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Folder> }) =>
      apiClient.patch<Folder>(`/api/folders/${id}`, updates),
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
    mutationFn: (id: string) => apiClient.delete(`/api/folders/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      await queryClient.cancelQueries({ queryKey: ['notes'] })

      const previousFolders = queryClient.getQueryData<Folder[]>(['folders'])
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      // Recursively gather subfolders to delete
      const getFolderIdsToDelete = (folderId: string, list: Folder[]): string[] => {
        const childrenIds = list
          .filter((f) => f.parentId === folderId)
          .flatMap((f) => getFolderIdsToDelete(f.id, list))
        return [folderId, ...childrenIds]
      }

      const folderIdsToDelete = getFolderIdsToDelete(id, previousFolders || [])

      queryClient.setQueryData<Folder[]>(['folders'], (old) =>
        (old || []).filter((f) => !folderIdsToDelete.includes(f.id))
      )
      
      const remainingNotes = (previousNotes || []).filter(
        (n) => !n.parentId || !folderIdsToDelete.includes(n.parentId)
      )
      queryClient.setQueryData<Note[]>(['notes'], remainingNotes)

      // If active note was in deleted folders, change selection
      const isActiveDeleted = (previousNotes || []).some(
        (n) => n.id === activeNoteId && n.parentId && folderIdsToDelete.includes(n.parentId)
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

  return React.useCallback(async (note: Note | undefined, folders: Folder[]): Promise<Folder[]> => {
    if (!note || !note.parentId) return []
    
    const path: Folder[] = []
    let currentParentId: string | null = note.parentId

    while (currentParentId) {
      let folder = folders.find((f) => f.id === currentParentId)
      if (!folder) {
        try {
          folder = await queryClient.fetchQuery<Folder>({
            queryKey: ['folders', currentParentId],
            queryFn: () => apiClient.get<Folder>(`/api/folders/${currentParentId}`),
          })
        } catch (err) {
          console.error(`Failed to fetch parent folder ${currentParentId}:`, err)
          break
        }
      }
      path.unshift(folder)
      currentParentId = folder.parentId
    }
    return path
  }, [queryClient])
}
