import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Editor } from '@tiptap/react'

import { ArrowRight } from 'lucide-react'
import { useBlockEdit } from './BlockEditProvider'

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

export interface CommandProps {
  nodePos: number
  editor: Editor
  dispatch: React.Dispatch<BlockEditMenuAction>
}

export interface BlockEditMenuItem {
  title: string
  description?: string
  keywords?: string[]
  icon: string
  command: (props?: CommandProps) => void
}

export function BlockEditMenu({ editor }: { editor: Editor }) {
  const { state, dispatch, hoverPos } = useBlockEdit()
  const position = hoverPos?.rect

  if (state.status !== 'open' || !position) return null
  const nodePos = hoverPos.nodePos

  const { items, selectedIndex } = state
  const selectedValue = items[selectedIndex]?.title ?? ''

  return (
    <Popover
      open={state.status === 'open'}
      onOpenChange={(open) => {
        if (!open) {
          dispatch({ type: 'CLOSE' })
        }
      }}
    >
      {/*
        PopoverAnchor isn't used here — we position the content manually via
        a fixed anchor div placed at the cursor coordinates.
      */}
      <div
        style={{
          position: 'absolute',
          top: position.top,
          left: position.left,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <PopoverContent
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left - 280,
          zIndex: 50,
          width: 240,
          padding: 0,
        }}
        // Prevent PopoverContent from trying to portal itself relative to a trigger.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          value={selectedValue}
          onValueChange={(val) => {
            const idx = items.findIndex((i) => i.title === val)
            if (idx !== -1)
              dispatch({
                type: 'MOVE',
                index: idx,
              })
          }}
        >
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {items.map((item, index) => (
                <CommandItem
                  key={item.title}
                  value={item.title}
                  data-selected={index === selectedIndex}
                  onSelect={(value) => {
                    const idx = items.findIndex((i) => i.title === value)
                    const item = state.items[idx]
                    item.command({ dispatch, nodePos, editor })
                  }}
                  className="flex items-center cursor-pointer"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{item.title}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </span>
                  <ArrowRight />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function reducer(
  state: BlockEditMenuState,
  action: BlockEditMenuAction,
): BlockEditMenuState {
  console.log('Menu reducer', action)
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
    icon: '->',
    command: (props?: CommandProps) => {
      props?.dispatch({ type: 'SUBMENU' })
      // Should not close the menu
      return false
    },
  },
]

export const BLOCK_EDIT_SUBCOMMANDS: BlockEditMenuItem[] = [
  {
    title: 'Back',
    icon: '->',
    command: (props?: CommandProps) => {
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
