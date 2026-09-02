import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Calendar } from 'lucide-react'
import type { Note } from '../model'
import { cn } from '#/lib/utils'
import { useSidebar } from '#/components/ui/sidebar'

import {
  useNotesStore,
  useResolveFullPath,
  useFoldersQuery,
  useNotesQuery,
} from '@/widgets/note-editor'
import type { Folder } from '@/widgets/note-editor'
import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'

const EMOJI_LIST = [
  '📄',
  '🚀',
  '💡',
  '📝',
  '💼',
  '📅',
  '🎯',
  '🏠',
  '🛒',
  '🎬',
  '🔑',
  '🎨',
  '🍕',
  '⚡',
  '🍀',
]

// Format date helper
const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export type EditorHeaderProps = {
  note: Note
  onNoteTitleChange: (newTitle: string) => void | undefined
  onIconChange: (newIcon: string) => void | undefined
  onFavoriteStateChange: (isFav: boolean) => void | undefined
}

export function EditorHeader({
  note: currentNote,
  onNoteTitleChange,
  onIconChange,
}: EditorHeaderProps) {
  const navigate = useNavigate()
  const { state: sidebarState } = useSidebar()
  const { data: foldersData } = useFoldersQuery()
  const { data: notesData } = useNotesQuery()
  const resolveFullPath = useResolveFullPath()
  const savingNoteId = useNotesStore((state) => state.savingNoteId)
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId)
  const [breadcrumbs, setBreadcrumbs] = React.useState<Folder[]>([])

  // Re-fetch breadcrumbs when current note, its parentId, or folders change
  React.useEffect(() => {
    let active = true
    resolveFullPath(currentNote, foldersData ?? []).then((path) => {
      if (active) {
        setBreadcrumbs(path)
      }
    })
    return () => {
      active = false
    }
  }, [currentNote.id, currentNote.parentId, foldersData, resolveFullPath])

  // There is no dedicated folder route, so clicking a folder crumb opens the
  // first note that lives directly inside it (falling back to the notes home).
  const handleNavigateToFolder = (folderId: string) => {
    const firstNote = (notesData ?? []).find((n) => n.parentId === folderId)
    if (firstNote) {
      setActiveNoteId(firstNote.id)
      navigate({ to: '/notes/$noteId', params: { noteId: firstNote.id } })
    } else {
      navigate({ to: '/notes' })
    }
  }

  const crumbSeparator = (
    <span className="text-muted-foreground/40 font-normal select-none">
      {'>'}
    </span>
  )

  return (
    <div className="w-full flex flex-col">
      {/* Full-width top bar: breadcrumb on the left, updated time on the right */}
      <div
        className={cn(
          'flex items-start justify-between gap-4 pr-6 pt-1 pb-1',
          // Clear the floating "open sidebar" button when the sidebar is closed
          sidebarState === 'collapsed' ? 'pl-16' : 'pl-6',
        )}
      >
        {/* Breadcrumb path to the current page */}
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground/80 font-medium animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <button
            type="button"
            onClick={() => navigate({ to: '/notes' })}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Workspace
          </button>
          {breadcrumbs.map((folder) => (
            <React.Fragment key={folder.id}>
              {crumbSeparator}
              <button
                type="button"
                onClick={() => handleNavigateToFolder(folder.id)}
                className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              >
                <span className="text-xs">{folder.icon || '📁'}</span>
                <span className="max-w-[160px] truncate">{folder.name}</span>
              </button>
            </React.Fragment>
          ))}
          {crumbSeparator}
          <span
            aria-current="page"
            className="flex items-center gap-1 text-foreground/90 font-semibold"
          >
            <span className="text-xs">{currentNote.icon || '📄'}</span>
            <span className="max-w-[160px] truncate">
              {currentNote.title || 'Untitled Note'}
            </span>
          </span>
        </nav>

        {/* Updated timestamp / save status — top right */}
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[10px] font-medium text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Updated {formatDate(currentNote.updatedAt)}
          </span>
          <span className="h-3 w-px bg-border/30" />
          {savingNoteId === currentNote.id ? (
            <span className="flex items-center gap-1 text-amber-500 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-500 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Centered content column */}
      <div className="w-full max-w-4xl mx-auto px-8 flex flex-col pt-4">
        {/* Emoji Selector / Page Icon */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-4xl p-1 rounded-lg hover:bg-muted/80 transition-all select-none cursor-pointer">
                {currentNote.icon || '📄'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="p-2 grid grid-cols-5 gap-1 w-44"
              align="start"
            >
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onIconChange(emoji)}
                  className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-sidebar-accent transition-all cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Interactive Page Title */}
        <input
          type="text"
          value={currentNote.title}
          onChange={(e) => onNoteTitleChange(e.target.value)}
          className="w-full text-4xl font-extrabold tracking-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground/20 font-heading text-foreground pt-2 pb-1"
          placeholder="Untitled Note"
        />

        <hr className="border-border/30 my-2" />
      </div>
    </div>
  )
}
