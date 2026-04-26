'use client'
// src/Tiptap.tsx
import { useEditor, EditorContent, EditorContext, Tiptap } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from './SlashCommandExtension'
import { useEffect } from 'react'
import { SlashCommandMenu } from './CommandList'

export default function Editor() {
  const editor = useEditor({
    extensions: [StarterKit, SlashCommand],
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
      <SlashCommandMenu />
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
