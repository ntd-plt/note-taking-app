import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Star, Calendar } from 'lucide-react'
import type { Note } from '../model'
import { cn } from '#/lib/utils'

import {
  useNotesStore,
  useResolveFullPath,
  useFoldersQuery,
} from '@/widgets/note-editor'
import type { Folder } from '@/widgets/note-editor'
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
  onFavoriteStateChange,
  onNoteTitleChange,
  onIconChange,
}: EditorHeaderProps) {
  const { data: folders = [] } = useFoldersQuery()
  const resolveFullPath = useResolveFullPath()
  const savingNoteId = useNotesStore((state) => state.savingNoteId)
  const [breadcrumbs, setBreadcrumbs] = React.useState<Folder[]>([])

  // Re-fetch breadcrumbs when current note, its parentId, or folders change
  React.useEffect(() => {
    let active = true
    resolveFullPath(currentNote, folders).then((path) => {
      if (active) {
        setBreadcrumbs(path)
      }
    })
    return () => {
      active = false
    }
  }, [
    currentNote.id,
    currentNote.parentId,
    folders,
    resolveFullPath,
    currentNote,
  ])

  return (
    <div className="w-full max-w-4xl mx-auto pt-10 px-8 flex flex-col gap-4">
      {/* Dynamic Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 font-medium select-none animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Workspace
          </span>
          {breadcrumbs.map((folder) => (
            <React.Fragment key={folder.id}>
              <span className="text-muted-foreground/40 font-normal">/</span>
              <span className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5">
                <span className="text-xs">{folder.icon || '📁'}</span>
                <span>{folder.name}</span>
              </span>
            </React.Fragment>
          ))}
          <span className="text-muted-foreground/40 font-normal">/</span>
          <span className="text-foreground/90 font-semibold flex items-center gap-1.5">
            <span className="text-xs">{currentNote.icon || '📄'}</span>
            <span className="truncate max-w-[120px]">
              {currentNote.title || 'Untitled Note'}
            </span>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
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

        {/* Quick Stats or Metadata */}
        <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground/80 bg-muted/40 px-2.5 py-1 rounded-full border border-border/10">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Updated:{' '}
            {formatDate(currentNote.updatedAt)}
          </span>
          <span className="h-3 w-px bg-border/20" />
          {savingNoteId === currentNote.id ? (
            <span className="flex items-center gap-1 text-amber-500 font-semibold animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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
  )
}
