import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ItemsUIState {
  activeItemId: string | null
  searchQuery: string
  savingItemId: string | null

  // Actions
  setActiveItemId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setSavingItemId: (id: string | null) => void
}

export const useItemsStore = create<ItemsUIState>()(
  persist(
    (set) => ({
      activeItemId: null,
      searchQuery: '',
      savingItemId: null,

      setActiveItemId: (id) => {
        set({ activeItemId: id })
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query })
      },

      setSavingItemId: (id) => {
        set({ savingItemId: id })
      },
    }),
    {
      name: 'items-workspace-storage',
      partialize: (state) => ({
        activeItemId: state.activeItemId,
      }),
    },
  ),
)
