'use client'
import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextStyleKit } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from '../plugins/SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'
import { Placeholder } from '@tiptap/extensions'
import { FileText, PlusCircle } from 'lucide-react'

import { BlockEditMenu } from './BlockEditMenu'
import { BlockHandle } from './BlockHandle'
import { Card, CardContent } from '#/components/ui/card'
import {
  useNotesStore,
  useNotesQuery,
  useUpdateNote,
  useCreateNote,
} from '../index'
import { EditorHeader } from './EditorHeader'
import {
  NodeHoverExtension,
  NODE_HOVER_PLUGIN_KEY,
} from '../plugins/NodeHoverExtension'
import { useNodeHoverState } from '../hooks/useNodeHoverState'
import { BubbleMenu } from './BubbleMenu'
import { CustomLayout, LayoutCell } from './CustomNode'
import { useNavigate } from '@tanstack/react-router'

export default function Editor() {
  return (
    <SlashMenuProvider>
      <EditorWithSlash />
    </SlashMenuProvider>
  )
}

function EditorWithSlash() {
  const navigate = useNavigate()
  const { renderSlashMenu } = useSlashMenu()

  // TanStack Query & Zustand Bindings
  const { data: notesData } = useNotesQuery()
  const notes = notesData ?? []
  const { activeNoteId } = useNotesStore()
  const { updateNote } = useUpdateNote()
  const createNoteMutation = useCreateNote()

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
      CustomLayout,
      LayoutCell,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor: innerEditor }) => {
          const { selection } = innerEditor.state
          const type = selection.$head.parent.type
          const grandParentType = selection.$head.node(-2).type
          const isList = ['bulletList', 'orderedList'].includes(
            grandParentType.name,
          )

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
      NodeHoverExtension,
    ],
    content: currentNote?.content || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral max-w-none focus:outline-none min-h-[400px] px-8 py-4',
      },
    },
    // Triggers when content changes inside the editor
    onUpdate: ({ editor: innerEditor }) => {
      const activeId = currentNoteRef.current?.id
      if (activeId) {
        const html = editor.getHTML()
        // Save to server (debounced)
        updateNote(activeId, { content: html })
      }
    },
  })

  const cardRef = React.useRef<HTMLDivElement>(null)
  const { hoveredNode } = useNodeHoverState(editor)
  const isList = hoveredNode?.type === 'listItem'
  const rect = hoveredNode?.rect ?? null
  const offset = 20

  const [adjustedRect, setAdjustedRect] =
    React.useState<DOMRectReadOnly | null>(null)

  React.useLayoutEffect(() => {
    if (rect && cardRef.current) {
      const cardEl = cardRef.current
      const cardRect = cardEl.getBoundingClientRect()

      const top = rect.top - cardRect.top + cardEl.scrollTop
      const left = rect.left - cardRect.left + cardEl.scrollLeft

      setAdjustedRect(
        new DOMRectReadOnly(
          left + (!isList ? 0 : -offset),
          top,
          rect.width + (!isList ? 0 : offset),
          rect.height,
        ),
      )
    } else {
      setAdjustedRect(null)
    }
  }, [rect, isList])
  // Sync editor content when the active note changes
  React.useEffect(() => {
    if (currentNote) {
      const editorHTML = editor.getHTML()
      if (editorHTML !== currentNote.content) {
        // Set content and preserve historical cursor state if needed
        editor.commands.setContent(currentNote.content, {})
      }
    }
  }, [currentNote?.id, editor])

  // Handle adding a default note when all are deleted
  const handleCreateFirstPage = () => {
    createNoteMutation.mutate(
      {
        parentId: null,
        title: 'Welcome to my new page',
      },
      {
        onSuccess: (newNote) => {
          console.log('New note created', newNote)
          navigate({
            to: '/notes/$noteId',
            params: { noteId: newNote.id },
          })
        },
      },
    )
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

  const handleMouseLeave = () => {
    editor.view.dispatch(
      editor.view.state.tr.setMeta(NODE_HOVER_PLUGIN_KEY, {
        isMouseInside: false,
        hoveredNode: null,
      }),
    )
  }

  return (
    <>
      {/* Wrapper captures mouseleave for the editor+handle area as a unit.
          BlockHandle is position:fixed but DOM-descendent, so moving editor→handle
          does NOT trigger this. Only exiting both does. */}
      <div className="h-full" onMouseLeave={handleMouseLeave}>
        <Card
          ref={cardRef}
          className="relative h-full border-none shadow-none rounded-none bg-background flex flex-col overflow-y-auto"
        >
          {/* Editor Page Header / Meta Block */}
          <EditorHeader
            note={currentNote}
            onNoteTitleChange={(newTitle: string) => {
              updateNote(currentNote.id, { title: newTitle })
            }}
            onIconChange={(newIcon) => {
              updateNote(currentNote.id, { icon: newIcon })
            }}
            onFavoriteStateChange={(isFav) => {
              updateNote(currentNote.id, { isFavorite: isFav })
            }}
          ></EditorHeader>

          {/* TipTap Rich Text Editor Container */}
          <CardContent className="flex-1 max-w-4xl mx-auto w-full px-0">
            <div className="prose prose-neutral max-w-none dark:prose-invert">
              <EditorContent editor={editor} />
            </div>
          </CardContent>

          {/* Handle is inside the wrapper and now inside Card so scroll tracks it */}
          <BlockHandle rect={adjustedRect} />
        </Card>
      </div>

      {/* Menu is outside — Radix portals it to body anyway */}
      <BlockEditMenu editor={editor} />
      <BubbleMenu editor={editor} />
    </>
  )
}

export { Editor }
