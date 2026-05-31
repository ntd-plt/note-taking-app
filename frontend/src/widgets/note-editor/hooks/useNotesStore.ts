import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import initialNotes from '../data/initialNotes'
import type { Note } from '../model.ts'

interface NotesState {
  notes: Note[]
  activeNoteId: string | null
  searchQuery: string
  addNote: (parentId?: string | null, title?: string) => string
  deleteNote: (id: string) => void
  updateNoteTitle: (id: string, title: string) => void
  updateNoteContent: (id: string, content: string) => void
  updateNoteIcon: (id: string, icon: string | undefined) => void
  setFavorite: (id: string, isFavorite: boolean) => void
  toggleExpand: (id: string) => void
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  duplicateNote: (id: string) => string
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: initialNotes,
      activeNoteId: 'getting-started',
      searchQuery: '',

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

        // If it has a parent, make sure the parent is expanded
        set((state) => {
          const notes = state.notes.map((n) => {
            if (parentId && n.id === parentId) {
              return { ...n, isExpanded: true }
            }
            return n
          })
          return {
            notes: [...notes, newNote],
            activeNoteId: id,
          }
        })

        return id
      },

      deleteNote: (id) => {
        // Recursive deletion helper to delete a note and all its subnotes
        const getIdsToDelete = (noteId: string, list: Note[]): string[] => {
          const childrenIds = list
            .filter((n) => n.parentId === noteId)
            .flatMap((n) => getIdsToDelete(n.id, list))
          return [noteId, ...childrenIds]
        }

        set((state) => {
          const idsToDelete = getIdsToDelete(id, state.notes)
          const remainingNotes = state.notes.filter(
            (n) => !idsToDelete.includes(n.id),
          )

          // If the deleted note was active, set active to another note
          let newActiveNoteId = state.activeNoteId
          if (state.activeNoteId && idsToDelete.includes(state.activeNoteId)) {
            newActiveNoteId =
              remainingNotes.length > 0 ? remainingNotes[0].id : null
          }

          return {
            notes: remainingNotes,
            activeNoteId: newActiveNoteId,
          }
        })
      },

      updateNoteTitle: (id, title) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, title, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))
      },

      updateNoteContent: (id, content) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, content, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))
      },

      updateNoteIcon: (id, icon) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, icon, updatedAt: new Date().toISOString() }
              : n,
          ),
        }))
      },

      setFavorite: (id, isFavorite) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isFavorite: isFavorite } : n,
          ),
        }))
      },

      toggleExpand: (id) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isExpanded: !n.isExpanded } : n,
          ),
        }))
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

        // Helper to duplicate descendants recursively
        const dupDescendants = (
          oldParentId: string,
          newParentId: string,
          list: Note[],
        ): Note[] => {
          const children = list.filter((n) => n.parentId === oldParentId)
          let added: Note[] = []

          children.forEach((child) => {
            const childNewId = Math.random().toString(36).substring(2, 9)
            const childDup: Note = {
              ...child,
              id: childNewId,
              parentId: newParentId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            added.push(childDup)
            added = [...added, ...dupDescendants(child.id, childNewId, list)]
          })

          return added
        }

        const desc = dupDescendants(id, newId, state.notes)

        set((state) => ({
          notes: [...state.notes, duplicatedNote, ...desc],
          activeNoteId: newId,
        }))

        return newId
      },
    }),
    {
      name: 'note-taking-workspace-storage',
    },
  ),
)
