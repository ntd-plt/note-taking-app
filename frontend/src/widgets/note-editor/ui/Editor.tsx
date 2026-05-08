'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import { TextStyleKit } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { SlashCommand } from './SlashCommandExtension'
import { SlashMenuProvider, useSlashMenu } from './CommandList'
import { Placeholder } from '@tiptap/extensions'

import {
  BlockEditProvider,
  MakeExtension,
  useBlockEdit,
} from './BlockEditProvider'
import { BlockEditMenu } from './BlockEditMenu'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

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
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyleKit,
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor }) => {
          const { selection } = editor.state
          const type = selection.$head.parent.type
          const pos = selection.$head.pos
          const grandParentType = selection.$head.node(-2)?.type
          const isList =
            grandParentType &&
            ['bulletList', 'orderedList'].includes(grandParentType.name)

          console.log(type)

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
    content: '',
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[200px] px-8',
      },
    },
  })
  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg">BIG TITTLE</CardTitle>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>1-1-2021</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose">
            <EditorContent editor={editor} className="px-8" />
          </div>
        </CardContent>
      </Card>
      <BlockEditMenu editor={editor} />
    </>
  )
}

export { Editor }
