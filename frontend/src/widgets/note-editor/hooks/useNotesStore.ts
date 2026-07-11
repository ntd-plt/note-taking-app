import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import initialNotes from '../data/initialNotes'
import type { Note, Folder } from '../model.ts'
import { apiClient } from '@/shared/api/client'
import { debounce } from '@/shared/lib/debounce'

// Keep caches of debounced sync functions per note
const debouncedContentSyncs: Record<string, ReturnType<typeof debounce>> = {}
const debouncedTitleSyncs: Record<string, ReturnType<typeof debounce>> = {}

interface NotesState {
  notes: Note[]
  folders: Folder[]
  activeNoteId: string | null
  searchQuery: string
  loadingFolders: boolean
  savingNoteId: string | null

  // Notes actions
  fetchNotes: () => Promise<void>
  addNote: (parentId?: string | null, title?: string) => string
  deleteNote: (id: string) => void
  updateNoteTitle: (id: string, title: string) => void
  updateNoteContent: (id: string, content: string) => void
  updateNoteIcon: (id: string, icon: string | undefined) => void
  setFavorite: (id: string, isFavorite: boolean) => void
  toggleFavorite: (id: string) => void
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  duplicateNote: (id: string) => string

  // Folder actions
  fetchFolders: () => Promise<void>
  fetchFolderById: (id: string) => Promise<Folder>
  resolveFullPath: (noteId: string) => Promise<Folder[]>
  addFolder: (parentId?: string | null, name?: string) => Promise<string>
  deleteFolder: (id: string) => Promise<void>
  updateFolderName: (id: string, name: string) => Promise<void>
  updateFolderIcon: (id: string, icon: string | undefined) => Promise<void>
  toggleFolderExpand: (id: string) => Promise<void>
  toggleExpand: (id: string) => void // Compatible mapping for folders
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,
      folders: [],
      activeNoteId: 'getting-started',
      searchQuery: '',
      loadingFolders: false,
      savingNoteId: null,

      // --- NOTE ACTIONS ---

      fetchNotes: async () => {
        try {
          const fetchedNotes = await apiClient.get<Note[]>('/api/notes')
          set({ notes: fetchedNotes })
        } catch (err) {
          console.error('Failed to fetch notes:', err)
        }
      },

      addNote: (parentId = null, title = 'Untitled Note') => {
        const id = Math.random().toString(36).substring(2, 9)
        const newNote: Note = {
          id,
          title,
          parentId: parentId || null,
          icon: '📄',
          content: `<h1>${title}</h1><p>Start writing here...</p>`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // If it has a parent folder, make sure the parent is expanded
        if (parentId) {
          get().toggleFolderExpand(parentId)
        }

        // 1. Optimistic local update
        set((state) => ({
          notes: [...state.notes, newNote],
          activeNoteId: id,
        }))

        // 2. Call backend in background
        apiClient.post<Note>('/api/notes', newNote).catch((err) => {
          console.error('Failed to save new note to server:', err)
        })

        return id
      },

      deleteNote: (id) => {
        // 1. Optimistic local delete
        set((state) => {
          const remainingNotes = state.notes.filter((n) => n.id !== id)

          let newActiveNoteId = state.activeNoteId
          if (state.activeNoteId === id) {
            newActiveNoteId = remainingNotes.length > 0 ? remainingNotes[0].id : null
          }

          return {
            notes: remainingNotes,
            activeNoteId: newActiveNoteId,
          }
        })

        // 2. Call backend in background
        apiClient.delete(`/api/notes/${id}`).catch((err) => {
          console.error('Failed to delete note from server:', err)
        })
      },

      updateNoteTitle: (id, title) => {
        // 1. Update local state instantly (snappy UI)
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, title, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))

        // 2. Initialize or get debounced sync function
        if (!debouncedTitleSyncs[id]) {
          debouncedTitleSyncs[id] = debounce(async (newTitle: string) => {
            set({ savingNoteId: id })
            try {
              await apiClient.patch(`/api/notes/${id}`, { title: newTitle })
            } catch (err) {
              console.error('Auto-save note title failed:', err)
            } finally {
              if (get().savingNoteId === id) {
                set({ savingNoteId: null })
              }
            }
          }, 1000) // 1-second debounce
        }

        // 3. Trigger debounced save
        debouncedTitleSyncs[id](title)
      },

      updateNoteContent: (id, content) => {
        // 1. Update local state instantly (snappy UI)
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, content, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))

        // 2. Initialize or get debounced sync function
        if (!debouncedContentSyncs[id]) {
          debouncedContentSyncs[id] = debounce(async (htmlContent: string) => {
            set({ savingNoteId: id })
            try {
              await apiClient.patch(`/api/notes/${id}`, { content: htmlContent })
            } catch (err) {
              console.error('Auto-save note content failed:', err)
            } finally {
              if (get().savingNoteId === id) {
                set({ savingNoteId: null })
              }
            }
          }, 1000) // 1-second debounce
        }

        // 3. Trigger debounced save
        debouncedContentSyncs[id](content)
      },

      updateNoteIcon: (id, icon) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, icon, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))

        apiClient.patch(`/api/notes/${id}`, { icon }).catch((err) => {
          console.error('Failed to sync note icon:', err)
        })
      },

      setFavorite: (id, isFavorite) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isFavorite } : n,
          ),
        }))

        apiClient.patch(`/api/notes/${id}`, { isFavorite }).catch((err) => {
          console.error('Failed to sync note favorite state:', err)
        })
      },

      toggleFavorite: (id) => {
        let nextFav = false
        set((state) => {
          const notes = state.notes.map((n) => {
            if (n.id === id) {
              nextFav = !n.isFavorite
              return { ...n, isFavorite: nextFav }
            }
            return n
          })
          return { notes }
        })

        apiClient.patch(`/api/notes/${id}`, { isFavorite: nextFav }).catch((err) => {
          console.error('Failed to sync note favorite state:', err)
        })
      },

      setActiveNoteId: (id) => {
        set({ activeNoteId: id })
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query })
      },

      duplicateNote: (id) => {
        const state = get()
        const noteToDup = state.notes.find((n) => n.id === id)
        if (!noteToDup) return ''

        const newId = Math.random().toString(36).substring(2, 9)
        const duplicatedNote: Note = {
          ...noteToDup,
          id: newId,
          title: `${noteToDup.title} (Copy)`,
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // 1. Optimistic local update
        set((state) => ({
          notes: [...state.notes, duplicatedNote],
          activeNoteId: newId,
        }))

        // 2. Call backend in background
        apiClient.post<Note>('/api/notes', duplicatedNote).catch((err) => {
          console.error('Failed to sync duplicated note to server:', err)
        })

        return newId
      },

      // --- FOLDER ACTIONS ---

      fetchFolders: async () => {
        set({ loadingFolders: true })
        try {
          const fetchedFolders = await apiClient.get<Folder[]>('/api/folders')
          set({ folders: fetchedFolders, loadingFolders: false })
        } catch (err) {
          console.error('Failed to fetch folders:', err)
          set({ loadingFolders: false })
        }
      },

      fetchFolderById: async (id: string) => {
        try {
          const folder = await apiClient.get<Folder>(`/api/folders/${id}`)
          set((state) => ({
            folders: state.folders.some((f) => f.id === id)
              ? state.folders.map((f) => (f.id === id ? folder : f))
              : [...state.folders, folder],
          }))
          return folder
        } catch (err) {
          console.error(`Failed to fetch folder ${id}:`, err)
          throw err
        }
      },

      resolveFullPath: async (noteId: string) => {
        const state = get()
        const note = state.notes.find((n) => n.id === noteId)
        if (!note || !note.parentId) return []

        const path: Folder[] = []
        let currentParentId: string | null = note.parentId

        while (currentParentId) {
          let folder = get().folders.find((f) => f.id === currentParentId)
          if (!folder) {
            try {
              folder = await get().fetchFolderById(currentParentId)
            } catch (err) {
              console.error(`Failed to resolve parent folder ${currentParentId}:`, err)
              break
            }
          }
          path.unshift(folder)
          currentParentId = folder.parentId
        }
        return path
      },

      addFolder: async (parentId = null, name = 'Untitled Folder') => {
        try {
          const newFolder = await apiClient.post<Folder>('/api/folders', {
            name,
            parentId,
          })
          set((state) => ({
            folders: [...state.folders, newFolder],
          }))
          return newFolder.id
        } catch (err) {
          console.error('Failed to create folder:', err)
          return ''
        }
      },

      deleteFolder: async (id: string) => {
        try {
          await apiClient.delete(`/api/folders/${id}`)

          set((state) => {
            const getFolderIdsToDelete = (folderId: string, list: Folder[]): string[] => {
              const childrenIds = list
                .filter((f) => f.parentId === folderId)
                .flatMap((f) => getFolderIdsToDelete(f.id, list))
              return [folderId, ...childrenIds]
            }

            const folderIdsToDelete = getFolderIdsToDelete(id, state.folders)

            const remainingFolders = state.folders.filter(
              (f) => !folderIdsToDelete.includes(f.id),
            )

            const remainingNotes = state.notes.filter(
              (n) => !n.parentId || !folderIdsToDelete.includes(n.parentId),
            )

            let newActiveNoteId = state.activeNoteId
            if (
              state.activeNoteId &&
              state.notes.some(
                (n) => n.id === state.activeNoteId && n.parentId && folderIdsToDelete.includes(n.parentId)
              )
            ) {
              newActiveNoteId = remainingNotes.length > 0 ? remainingNotes[0].id : null
            }

            return {
              folders: remainingFolders,
              notes: remainingNotes,
              activeNoteId: newActiveNoteId,
            }
          })
        } catch (err) {
          console.error('Failed to delete folder:', err)
        }
      },

      updateFolderName: async (id, name) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f,
          ),
        }))
        try {
          await apiClient.patch(`/api/folders/${id}`, { name })
        } catch (err) {
          console.error('Failed to update folder name:', err)
        }
      },

      updateFolderIcon: async (id, icon) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, icon, updatedAt: new Date().toISOString() } : f,
          ),
        }))
        try {
          await apiClient.patch(`/api/folders/${id}`, { icon })
        } catch (err) {
          console.error('Failed to update folder icon:', err)
        }
      },

      toggleFolderExpand: async (id) => {
        const folder = get().folders.find((f) => f.id === id)
        if (!folder) return
        const nextExpanded = !folder.isExpanded

        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, isExpanded: nextExpanded } : f,
          ),
        }))

        try {
          await apiClient.patch(`/api/folders/${id}`, { isExpanded: nextExpanded })
        } catch (err) {
          console.error('Failed to update folder expanded state:', err)
        }
      },

      toggleExpand: (id) => {
        get().toggleFolderExpand(id)
      },
    }),
    {
      name: 'note-taking-workspace-storage',
      // We only persist notes since folders are fetched from API
      partialize: (state) => ({
        notes: state.notes,
        activeNoteId: state.activeNoteId,
      }),
    },
  ),
)
