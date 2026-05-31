'use client'
import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextStyleKit } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from '../plugins/SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'
import { Placeholder } from '@tiptap/extensions'

import {
  BlockEditProvider,
  MakeExtension,
  useBlockEdit,
} from './BlockEditProvider'
import { BlockEditMenu } from './BlockEditMenu'
import { Card, CardContent } from '#/components/ui/card'
import { useNotesStore } from '../hooks/useNotesStore'
import { Star, Calendar, Sparkles, FileText, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

export default function Editor() {
  return (
    <SlashMenuProvider>
      <BlockEditProvider>
        <EditorWithSlash />
      </BlockEditProvider>
    </SlashMenuProvider>
  )
}

function EditorWithSlash() {
  const { renderSlashMenu } = useSlashMenu()
  const { setHoverPos, setMouseInside } = useBlockEdit()

  // Zustand Notes Store Bindings
  const {
    notes,
    activeNoteId,
    updateNoteTitle,
    updateNoteContent,
    updateNoteIcon,
    toggleFavorite,
    addNote,
  } = useNotesStore()

  const currentNote = notes.find((n) => n.id === activeNoteId)

  // Use a Ref to store currentNote state so Tiptap callback closures don't get stale
  const currentNoteRef = React.useRef(currentNote)
  React.useEffect(() => {
    currentNoteRef.current = currentNote
  }, [currentNote])

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyleKit,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor }) => {
          const { selection } = editor.state
          const type = selection.$head.parent.type
          const grandParentType = selection.$head.node(-2)?.type
          const isList =
            grandParentType &&
            ['bulletList', 'orderedList'].includes(grandParentType.name)

          if (isList) {
            return 'List'
          } else {
            switch (type.name) {
              case 'paragraph':
                return 'Type / to open command menu…'
              case 'heading':
                return 'Heading ' + selection.$head.parent.attrs.level
            }
          }
          return 'Type / to open command menu…'
        },
      }),
      SlashCommand.configure({
        suggestion: {
          render: renderSlashMenu,
        },
      }),
      MakeExtension(setMouseInside, setHoverPos),
    ],
    content: currentNote?.content || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral max-w-none focus:outline-none min-h-[400px] px-8 py-4',
      },
    },
    // Triggers when content changes inside the editor
    onUpdate: ({ editor }) => {
      const activeId = currentNoteRef.current?.id
      if (activeId) {
        const html = editor.getHTML()
        // Save to Zustand store
        useNotesStore.getState().updateNoteContent(activeId, html)
      }
    },
  })

  // Sync editor content when the active note changes
  React.useEffect(() => {
    if (editor && currentNote) {
      const editorHTML = editor.getHTML()
      if (editorHTML !== currentNote.content) {
        // Set content and preserve historical cursor state if needed
        editor.commands.setContent(currentNote.content, false)
      }
    }
  }, [currentNote?.id, editor])

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

  // Handle adding a default note when all are deleted
  const handleCreateFirstPage = () => {
    addNote(null, 'Welcome to my new page')
  }

  if (!currentNote) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center border-none">
        <div className="mx-auto max-w-md space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-heading font-bold text-foreground">
              No Page Selected
            </h2>
            <p className="text-sm text-muted-foreground">
              Select an existing page from the sidebar navigation, or create a
              brand new one to start writing.
            </p>
          </div>
          <button
            onClick={handleCreateFirstPage}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/95 transition-all cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" />
            Create First Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Card className="h-full border-none shadow-none rounded-none bg-background flex flex-col overflow-y-auto">
        {/* Editor Page Header / Meta Block */}
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
                      onClick={() => updateNoteIcon(currentNote.id, emoji)}
                      className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-sidebar-accent transition-all cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Floating Favorite Star next to Emoji */}
              <button
                onClick={() => toggleFavorite(currentNote.id)}
                className="p-1.5 rounded-lg hover:bg-muted/80 text-muted-foreground/60 hover:text-primary transition-all cursor-pointer"
                title={
                  currentNote.isFavorite ? 'Unfavorite Note' : 'Favorite Note'
                }
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
                <Sparkles className="h-3 w-3 fill-primary/10 text-primary" />{' '}
                Notion style
              </span>
            </div>
          </div>

          {/* Interactive Page Title */}
          <input
            type="text"
            value={currentNote.title}
            onChange={(e) => updateNoteTitle(currentNote.id, e.target.value)}
            className="w-full text-4xl font-extrabold tracking-tight bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground/20 font-heading text-foreground pt-2 pb-1"
            placeholder="Untitled Note"
          />

          <hr className="border-border/30 my-2" />
        </div>

        {/* TipTap Rich Text Editor Container */}
        <CardContent className="flex-1 max-w-4xl mx-auto w-full px-0">
          <div className="prose prose-neutral max-w-none dark:prose-invert">
            <EditorContent editor={editor} />
          </div>
        </CardContent>
      </Card>

      {/* Notion-style block hover floating menu (Shadcn + Tiptap) */}
      <BlockEditMenu editor={editor} />
    </>
  )
}

export { Editor }
