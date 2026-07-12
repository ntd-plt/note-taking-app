import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, mapBackendNote, mapBackendFolder } from '@/shared/api'
import type { Note, Folder } from '../model'
import { useNotesStore } from './useNotesStore'
import { debounce } from '@/shared/lib/debounce'
import * as React from 'react'

// Queries
export function useNotesQuery() {
  return useQuery({
    queryKey: ['notes'],
    queryFn: async () => {
      const response = await apiClient.get<any[]>('/api/notes')
      return response.map(mapBackendNote)
    },
  })
}

export function useFoldersQuery() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const response = await apiClient.get<any[]>('/api/folders')
      return response.map(mapBackendFolder)
    },
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

      const payload = {
        notes: [
          {
            id,
            title,
            content,
          },
        ],
      }

      const response = await apiClient.put<any[]>('/api/notes', payload)
      const updated = response[0]
      const mapped = mapBackendNote(updated)
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
      const payload = {
        title: newNote.title || 'Untitled Note',
        content: newNote.content || '',
        folder_id: newNote.parentId || null,
      }
      const response = await apiClient.post<any>('/api/notes', payload)
      const mapped = mapBackendNote(response)
      mapped.icon = newNote.icon || '📄'
      mapped.isFavorite = newNote.isFavorite || false
      return mapped
    },
    onMutate: async (newNote) => {
      const id = newNote.id || Math.random().toString(36).substring(2, 9)
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
    mutationFn: (id: string) =>
      apiClient.delete<any>('/api/notes', {
        body: JSON.stringify({ ids: [id] }),
      }),
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
      const payload = {
        title: `${noteToDup.title} (Copy)`,
        content: noteToDup.content,
        folder_id: noteToDup.parentId || null,
      }
      const response = await apiClient.post<any>('/api/notes', payload)
      const mapped = mapBackendNote(response)
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
      const payload = {
        name: newFolder.name || 'Untitled Folder',
        parent_folder_id: newFolder.parentId || null,
      }
      const response = await apiClient.post<any>('/api/folders', payload)
      const mapped = mapBackendFolder(response)
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

      const payload = {
        folders: [
          {
            id,
            name,
            parent_folder_id: parentFolderId,
          },
        ],
      }

      const response = await apiClient.put<any[]>('/api/folders', payload)
      const updated = response[0]
      const mapped = mapBackendFolder(updated)
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
    mutationFn: (id: string) =>
      apiClient.delete<any>('/api/folders', {
        body: JSON.stringify({ ids: [id] }),
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] })
      await queryClient.cancelQueries({ queryKey: ['notes'] })

      const previousFolders = queryClient.getQueryData<Folder[]>(['folders'])
      const previousNotes = queryClient.getQueryData<Note[]>(['notes'])

      // Recursively gather subfolders to delete
      const getFolderIdsToDelete = (
        folderId: string,
        list: Folder[],
      ): string[] => {
        const childrenIds = list
          .filter((f) => f.parentId === folderId)
          .flatMap((f) => getFolderIdsToDelete(f.id, list))
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
      if (!note || !note.parentId) return []

      const path: Folder[] = []
      let currentParentId: string | null = note.parentId

      while (currentParentId) {
        let folder = folders.find((f) => f.id === currentParentId)
        if (!folder) {
          try {
            folder = await queryClient.fetchQuery<Folder>({
              queryKey: ['folders', currentParentId],
              queryFn: async () => {
                const res = await apiClient.get<any>(
                  `/api/folders/${currentParentId}`,
                )
                return mapBackendFolder(res)
              },
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
