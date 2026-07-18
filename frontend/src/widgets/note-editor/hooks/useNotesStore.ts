import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotesUIState {
  activeNoteId: string | null
  searchQuery: string
  savingNoteId: string | null

  // Actions
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSavingNoteId: (id: string | null) => void
}

export const useNotesStore = create<NotesUIState>()(
  persist(
    (set) => ({
      activeNoteId: 'getting-started',
      searchQuery: '',
      savingNoteId: null,

      setActiveNoteId: (id) => {
        set({ activeNoteId: id })
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query })
      },

      setSavingNoteId: (id) => {
        set({ savingNoteId: id })
      },
    }),
    {
      name: 'note-taking-workspace-storage',
      partialize: (state) => ({
        activeNoteId: state.activeNoteId,
      }),
    },
  ),
)
