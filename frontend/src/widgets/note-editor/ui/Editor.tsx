'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from './SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'
import { EditorState } from '@tiptap/pm/state'
import {
  BlockEditProvider,
  MakeExtension,
  useBlockEdit,
} from './BlockEditProvider'

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
  const { setHoverPos } = useBlockEdit()
  const editor = useEditor({
    extensions: [
      StarterKit,
      SlashCommand.configure({
        suggestion: {
          render: renderSlashMenu,
        },
      }),
      MakeExtension(setHoverPos),
    ],
    content: '<p>Type <strong>/</strong> to open the command menu…</p>',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  })
  editor.view.posAtCoords
  return (
    <div className="border border-gray-200 rounded-lg">
      <EditorContent editor={editor} />
    </div>
  )
}

export { Editor }
