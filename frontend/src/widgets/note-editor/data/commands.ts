import type {
  BlockEditMenuItem,
  BlockEditMenuItemCommandProps,
  SlashCommandItem,
} from '../model'

import { ArrowBigLeftIcon, ArrowBigRightIcon, DeleteIcon } from 'lucide-react'

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title'],
    icon: 'H1',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 1 })
        // .setNode('heading', { level: 1 })
        .run()
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: 'H2',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run()
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading'],
    icon: 'H3',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 3 })
        .run()
    },
  },
  {
    title: 'Bullet list',
    description: 'Unordered list of items',
    keywords: ['ul', 'list', 'bullet', 'unordered'],
    icon: '•—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Numbered list',
    description: 'Ordered list of items',
    keywords: ['ol', 'list', 'ordered', 'number'],
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Blockquote',
    description: 'Highlighted quote block',
    keywords: ['quote', 'blockquote', 'cite'],
    icon: '❝',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Code block',
    description: 'Monospace code block',
    keywords: ['code', 'pre', 'monospace'],
    icon: '</>',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Horizontal rule',
    description: 'Visual divider between sections',
    keywords: ['hr', 'divider', 'separator', 'rule'],
    icon: '──',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

export const BLOCK_EDIT_COMMANDS: BlockEditMenuItem[] = [
  {
    title: 'Turn into',
    icon: ArrowBigRightIcon,
    command: (props?: BlockEditMenuItemCommandProps) => {
      props?.dispatch({ type: 'SUBMENU' })
      // Should not close the menu
      return false
    },
  },
  {
    title: 'Delete',
    icon: DeleteIcon,
    command: (props?: BlockEditMenuItemCommandProps) => {
      if (!props) return
      const { editor, nodePos, dispatch } = props
      editor
        .chain()
        .focus(nodePos - 1)
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(nodePos)
          if (!node) return false

          tr.delete(nodePos - 1, nodePos + node.nodeSize)
          return true
        })
        .run()
      dispatch({ type: 'CLOSE' })
      return false
    },
  },
]

export const BLOCK_EDIT_SUBCOMMANDS: BlockEditMenuItem[] = [
  {
    title: 'Back',
    icon: ArrowBigLeftIcon,
    command: (props?: BlockEditMenuItemCommandProps) => {
      props?.dispatch({ type: 'BACK' })
    },
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title'],
    icon: 'H1',
    command: (props) => {
      if (props) {
        props.editor
          .chain()
          .focus()
          .setNodeSelection(props.nodePos)
          .setNode('heading', { level: 1 })
          .run()
        props.dispatch({ type: 'CLOSE' })
      }
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: 'H2',
    command: (props) => {
      if (props) {
        props.editor
          .chain()
          .focus()
          .setNodeSelection(props.nodePos)
          .setNode('heading', { level: 1 })
          .run()
        props.dispatch({ type: 'CLOSE' })
      }
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading'],
    icon: 'H3',
    command: () => {},
  },
  {
    title: 'Bullet list',
    description: 'Unordered list of items',
    keywords: ['ul', 'list', 'bullet', 'unordered'],
    icon: '•—',
    command: () => {},
  },
  {
    title: 'Numbered list',
    description: 'Ordered list of items',
    keywords: ['ol', 'list', 'ordered', 'number'],
    icon: '1.',
    command: () => {},
  },
  {
    title: 'Blockquote',
    description: 'Highlighted quote block',
    keywords: ['quote', 'blockquote', 'cite'],
    icon: '❝',
    command: () => {},
  },
  {
    title: 'Code block',
    description: 'Monospace code block',
    keywords: ['code', 'pre', 'monospace'],
    icon: '</>',
    command: () => {},
  },
  {
    title: 'Horizontal rule',
    description: 'Visual divider between sections',
    keywords: ['hr', 'divider', 'separator', 'rule'],
    icon: '──',
    command: () => {},
  },
]
