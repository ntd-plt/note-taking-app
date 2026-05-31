import { ArrowBigLeftIcon, ArrowBigRightIcon, DeleteIcon } from 'lucide-react'
import { create } from 'zustand'
import { redux } from 'zustand/middleware'
import type { Editor } from '@tiptap/react'
import type { ComponentType } from 'react'

export interface BlockEditMenuItem {
  title: string
  description?: string
  keywords?: string[]
  icon: string | ComponentType
  command: (props?: BlockEditMenuItemCommandProps) => void
}

export interface BlockEditMenuItemCommandProps {
  nodePos: number
  editor: Editor
  dispatch: React.Dispatch<BlockEditMenuAction>
}

export const useBlockEditMenuStore = create(
  redux(blockEditMenuReducer, {
    status: 'closed',
  } as BlockEditMenuState),
)

export type BlockEditMenuAction =
  | { type: 'OPEN' }
  | { type: 'UPDATE' }
  | { type: 'SUBMENU' }
  | { type: 'BACK' }
  | { type: 'MOVE'; index: number }
  | { type: 'CLOSE' }

export type BlockEditMenuState =
  | { status: 'closed' }
  | {
      status: 'open'
      nested: boolean
      items: BlockEditMenuItem[]
      selectedIndex: number
    }

export function blockEditMenuReducer(
  state: BlockEditMenuState,
  action: BlockEditMenuAction,
): BlockEditMenuState {
  switch (action.type) {
    case 'OPEN':
    case 'UPDATE':
      return {
        nested: false,
        status: 'open',
        items: BLOCK_EDIT_COMMANDS,
        selectedIndex: 0,
      }

    case 'MOVE': {
      if (state.status !== 'open') return state
      const len = state.items.length
      const newIndex =
        action.index < 0 ? len - 1 : action.index >= len ? 0 : action.index
      return { ...state, selectedIndex: newIndex }
    }

    case 'SUBMENU':
      if (state.status !== 'open' || state.nested) return state
      return {
        ...state,
        items: BLOCK_EDIT_SUBCOMMANDS,
        nested: true,
      }

    case 'BACK':
      if (state.status !== 'open' || !state.nested) return state
      return {
        ...state,
        items: BLOCK_EDIT_COMMANDS,
        nested: false,
      }

    case 'CLOSE':
      return { status: 'closed' }
  }
}

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
      // const curNode = props?.editor.state.selection.$head.before()
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
