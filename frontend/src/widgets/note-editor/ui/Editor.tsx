'use client'
// src/Tiptap.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from './SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'

export default function Editor() {
  return (
    <SlashMenuProvider>
      <EditorWithSlash />
    </SlashMenuProvider>
  )
}

function EditorWithSlash() {
  const { renderSlashMenu } = useSlashMenu()
  const editor = useEditor({
    extensions: [
      StarterKit,
      SlashCommand.configure({
        suggestion: {
          render: renderSlashMenu,
        },
      }),
    ],
    content: '<p>Type <strong>/</strong> to open the command menu…</p>',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  })
  return (
    <div className="border border-gray-200 rounded-lg">
      <EditorContent editor={editor} />
    </div>
  )
}

export const BlockWrapper = (props: any) => {
  return (
    <NodeViewWrapper className="group relative">
      <div className="absolute -left-6 opacity-0 group-hover:opacity-100">
        ⋮⋮
      </div>
      {props.children}
    </NodeViewWrapper>
  )
}

export { Editor }
