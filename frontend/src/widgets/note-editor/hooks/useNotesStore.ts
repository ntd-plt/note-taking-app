import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Note {
  id: string
  title: string
  content: string
  parentId: string | null
  isFavorite?: boolean
  isExpanded?: boolean
  icon?: string // Emoji string, e.g., "🚀"
  createdAt: string
  updatedAt: string
}

interface NotesState {
  notes: Note[]
  activeNoteId: string | null
  searchQuery: string
  addNote: (parentId?: string | null, title?: string) => string
  deleteNote: (id: string) => void
  updateNoteTitle: (id: string, title: string) => void
  updateNoteContent: (id: string, content: string) => void
  updateNoteIcon: (id: string, icon: string | undefined) => void
  toggleFavorite: (id: string) => void
  toggleExpand: (id: string) => void
  setActiveNoteId: (id: string | null) => void
  setSearchQuery: (query: string) => void
  duplicateNote: (id: string) => string
}

const initialNotes: Note[] = [
  {
    id: 'getting-started',
    title: '🚀 Getting Started',
    parentId: null,
    isFavorite: true,
    isExpanded: true,
    icon: '🚀',
    content: `
      <h2>Welcome to your new workspace!</h2>
      <p>This is a Notion-like note-taking application designed with a focus on rich visual aesthetics and highly polished interactions.</p>
      <p></p>
      <h3>💡 How to use the Editor:</h3>
      <ul>
        <li>Click anywhere and start typing to write content.</li>
        <li>Type <code>/</code> (slash) on a empty line to open the <strong>Slash Command Menu</strong>.</li>
        <li>Hover over a block to reveal the **Drag Handle**, which lets you change block type or delete it.</li>
      </ul>
      <p></p>
      <h3>📂 Notion Sidebar features:</h3>
      <ul>
        <li><strong>Collapsible hierarchy</strong>: Click the arrow next to a note to reveal sub-notes.</li>
        <li><strong>Quick Actions</strong>: Hover over any sidebar item to add a sub-note (<code>+</code>) or open options (<code>...</code>).</li>
        <li><strong>Favorites</strong>: Star your most important notes for quick access at the top.</li>
        <li><strong>Quick Find</strong>: Click "Quick Find" or press <code>Ctrl+K</code> to instantly search across all notes.</li>
      </ul>
    `,
    createdAt: new Date('2026-05-30T10:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T10:00:00.000Z').toISOString(),
  },
  {
    id: 'work-space',
    title: '💼 Work',
    parentId: null,
    isFavorite: false,
    isExpanded: true,
    icon: '💼',
    content: `
      <h2>Work Workspace</h2>
      <p>Manage your projects, team documents, and meetings here.</p>
      <p>Create nested notes inside this folder to organize weekly syncs, plans, and task lists.</p>
    `,
    createdAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T11:00:00.000Z').toISOString(),
  },
  {
    id: 'weekly-sync',
    title: '📅 Weekly Team Sync',
    parentId: 'work-space',
    isFavorite: true,
    isExpanded: false,
    icon: '📅',
    content: `
      <h2>Weekly Team Sync - May 31, 2026</h2>
      <p><strong>Attendees:</strong> Lam Tung, Alex, Emily, Michael</p>
      <p></p>
      <h3>📋 Agenda</h3>
      <ul>
        <li>Product launch roadmap and review</li>
        <li>Design updates for Sidebar Navigation</li>
        <li>Sprint planning and backlog review</li>
      </ul>
      <p></p>
      <h3>📝 Actions & Updates</h3>
      <p>Tung is building the new Notion-like sidebar component today! The sidebar will support collapsible sub-pages and quick actions.</p>
    `,
    createdAt: new Date('2026-05-31T09:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T09:00:00.000Z').toISOString(),
  },
  {
    id: 'product-roadmap',
    title: '🎯 Q3 Product Roadmap',
    parentId: 'work-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🎯',
    content: `
      <h2>🎯 Q3 Product Roadmap</h2>
      <p>Here is our high-level visual roadmap for Q3.</p>
      <ul>
        <li><strong>July</strong>: Offline storage sync & workspace export.</li>
        <li><strong>August</strong>: Realtime collaborative multi-user editing.</li>
        <li><strong>September</strong>: Canvas-style visual whiteboard blocks.</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T09:30:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T09:30:00.000Z').toISOString(),
  },
  {
    id: 'personal-space',
    title: '🏠 Personal',
    parentId: null,
    isFavorite: false,
    isExpanded: true,
    icon: '🏠',
    content: `
      <h2>🏠 Personal Vault</h2>
      <p>A place for your journals, reading list, travel plans, and fitness logs.</p>
    `,
    createdAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-30T12:00:00.000Z').toISOString(),
  },
  {
    id: 'groceries',
    title: '🛒 Grocery List',
    parentId: 'personal-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🛒',
    content: `
      <h2>🛒 Grocery List</h2>
      <p>Pick up on Sunday:</p>
      <ul>
        <li>Fresh sourdough bread 🥖</li>
        <li>Organic Hass avocados 🥑</li>
        <li>Greek yogurt & Blueberries 🫐</li>
        <li>Cold brew coffee beans ☕</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T08:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T08:00:00.000Z').toISOString(),
  },
  {
    id: 'movies-to-watch',
    title: '🎬 Movies to Watch',
    parentId: 'personal-space',
    isFavorite: false,
    isExpanded: false,
    icon: '🎬',
    content: `
      <h2>🎬 Movies & Shows reading list</h2>
      <p>Recommended by friends:</p>
      <ul>
        <li><strong>Dune: Part Two</strong> (Sci-fi masterpiece)</li>
        <li><strong>Severance Season 2</strong> (Mind-bending workplace mystery)</li>
        <li><strong>Interstellar</strong> (Rewatch in IMAX if possible)</li>
      </ul>
    `,
    createdAt: new Date('2026-05-31T08:30:00.000Z').toISOString(),
    updatedAt: new Date('2026-05-31T08:30:00.000Z').toISOString(),
  }
]

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
          const remainingNotes = state.notes.filter((n) => !idsToDelete.includes(n.id))

          // If the deleted note was active, set active to another note
          let newActiveNoteId = state.activeNoteId
          if (state.activeNoteId && idsToDelete.includes(state.activeNoteId)) {
            newActiveNoteId = remainingNotes.length > 0 ? remainingNotes[0].id : null
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
              : n
          ),
        }))
      },

      updateNoteContent: (id, content) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, content, updatedAt: new Date().toISOString() }
              : n
          ),
        }))
      },

      updateNoteIcon: (id, icon) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, icon, updatedAt: new Date().toISOString() } : n
          ),
        }))
      },

      toggleFavorite: (id) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isFavorite: !n.isFavorite } : n
          ),
        }))
      },

      toggleExpand: (id) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, isExpanded: !n.isExpanded } : n
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
        const dupDescendants = (oldParentId: string, newParentId: string, list: Note[]): Note[] => {
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
    }
  )
)
