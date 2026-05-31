'use client'
import * as React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextStyleKit } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from '../plugins/SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'
import { Placeholder } from '@tiptap/extensions'
import { FileText, PlusCircle } from 'lucide-react'

import { BlockEditProvider, useBlockEdit } from './BlockEditProvider'
import { BlockEditMenu } from './BlockEditMenu'
import { Card, CardContent } from '#/components/ui/card'
import { useNotesStore } from '../hooks/useNotesStore'
import { EditorHeader } from './EditorHeader'
import { MakeBlockHandleExtension } from '../plugins/BlockHandleExtension'

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
    setFavorite,
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
      MakeBlockHandleExtension(setMouseInside, setHoverPos),
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
        editor.commands.setContent(currentNote.content, {})
      }
    }
  }, [currentNote?.id, editor])

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
        <EditorHeader
          note={currentNote}
          onNoteTitleChange={(newTitle: string) => {
            updateNoteTitle(currentNote.id, newTitle)
          }}
          onIconChange={(newIcon) => {
            updateNoteIcon(currentNote.id, newIcon)
          }}
          onFavoriteStateChange={(isFav) => {
            setFavorite(currentNote.id, isFav)
          }}
        ></EditorHeader>

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
