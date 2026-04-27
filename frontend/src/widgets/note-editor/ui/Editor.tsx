'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextStyleKit } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from './SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'

import {
  BlockEditProvider,
  MakeExtension,
  useBlockEdit,
} from './BlockEditProvider'
import { BlockEditMenu } from './BlockEditMenu'

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
      TextStyleKit,
      SlashCommand.configure({
        suggestion: {
          render: renderSlashMenu,
        },
      }),
      MakeExtension(setHoverPos),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[200px] px-16 pt-8',
      },
    },
  })
  return (
    <div className="border border-gray-200 rounded-lg">
      <EditorContent editor={editor} />
      <BlockEditMenu editor={editor} />
    </div>
  )
}

export { Editor }
