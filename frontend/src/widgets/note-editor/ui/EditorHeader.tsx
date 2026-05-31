import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Star, Calendar, Sparkles, FileText, PlusCircle } from 'lucide-react'
import type { Note } from '../hooks/useNotesStore'
import { cn } from '#/lib/utils'

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
  return (
    <div className="w-full max-w-4xl mx-auto pt-10 px-8 flex flex-col gap-4">
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

          {/* Floating Favorite Star next to Emoji */}
          <button
            onClick={() => onFavoriteStateChange(!currentNote.isFavorite)}
            className="p-1.5 rounded-lg hover:bg-muted/80 text-muted-foreground/60 hover:text-primary transition-all cursor-pointer"
            title={currentNote.isFavorite ? 'Unfavorite Note' : 'Favorite Note'}
          >
            <Star
              className={cn(
                'h-5 w-5',
                currentNote.isFavorite && 'fill-primary text-primary',
              )}
            />
          </button>
        </div>

        {/* Quick Stats or Metadata */}
        <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground/80 bg-muted/40 px-2.5 py-1 rounded-full border border-border/10">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Updated:{' '}
            {formatDate(currentNote.updatedAt)}
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Sparkles className="h-3 w-3 fill-primary/10 text-primary" /> Notion
            style
          </span>
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
