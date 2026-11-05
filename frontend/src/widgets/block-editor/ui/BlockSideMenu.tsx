// The menu beside the hovered block: "+" adds a block below and opens the type
// menu (on an empty text block it applies to that block), and ⋮⋮ opens Turn into,
// Delete and Duplicate block. ⋮⋮ is also the drag handle: pressing and moving
// starts a drag, pressing and releasing opens the menu.
import * as React from 'react'
import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  AddBlockButton,
  SideMenu,
  useBlockNoteEditor,
  useExtension,
  useExtensionState,
} from '@blocknote/react'
import { GripVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { EditorBlock, EditorSchema } from '../model/schema'

export const DragStartContext = React.createContext<
  ((blockId: string, pointer: { x: number; y: number }) => void) | null
>(null)

const DRAG_THRESHOLD = 4

type TurnInto = {
  label: string
  type: EditorBlock['type']
  props?: Record<string, unknown>
}

export const TURN_INTO: TurnInto[] = [
  { label: 'Text', type: 'paragraph' },
  { label: 'Heading 1', type: 'heading', props: { level: 1 } },
  { label: 'Heading 2', type: 'heading', props: { level: 2 } },
  { label: 'Heading 3', type: 'heading', props: { level: 3 } },
  { label: 'Bulleted list', type: 'bulletListItem' },
  { label: 'Numbered list', type: 'numberedListItem' },
  { label: 'To-do list', type: 'checkListItem' },
  { label: 'Toggle list', type: 'toggleListItem' },
  { label: 'Quote', type: 'quote' },
]

// withNewIds copies a block and everything under it with fresh ids.
export function withNewIds(block: EditorBlock): EditorBlock {
  return {
    ...block,
    id: crypto.randomUUID(),
    children: block.children.map(withNewIds),
  }
}

export function BlockSideMenu() {
  return (
    <SideMenu>
      <AddBlockButton />
      <BlockHandle />
    </SideMenu>
  )
}

function BlockHandle() {
  const editor = useBlockNoteEditor<
    EditorSchema['blockSchema'],
    EditorSchema['inlineContentSchema'],
    EditorSchema['styleSchema']
  >()
  const sideMenu = useExtension(SideMenuExtension)
  const block = useExtensionState(SideMenuExtension, {
    selector: (s) => s?.block,
  }) as EditorBlock | undefined
  const startDrag = React.useContext(DragStartContext)
  const [open, setOpen] = React.useState(false)

  if (!block) return null
  const blockId = block.id
  const current = () => editor.getBlock(blockId)

  const setMenuOpen = (next: boolean) => {
    setOpen(next)
    if (next) sideMenu.freezeMenu()
    else sideMenu.unfreezeMenu()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Keep Radix from opening the menu on press: a press may become a drag.
    e.preventDefault()
    const from = { x: e.clientX, y: e.clientY }
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < DRAG_THRESHOLD)
        return
      cleanup()
      startDrag?.(blockId, { x: ev.clientX, y: ev.clientY })
    }
    const up = () => {
      cleanup()
      setMenuOpen(true)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const isPage = block.type === 'page'

  return (
    <DropdownMenu open={open} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Drag to move, click for options"
          data-block-handle={blockId}
          onPointerDown={onPointerDown}
          className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="left" align="start" className="w-48">
        {!isPage && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs">
              Turn into
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {TURN_INTO.map((t) => (
                <DropdownMenuItem
                  key={t.label}
                  className="text-xs"
                  onSelect={() => {
                    const b = current()
                    if (b)
                      editor.updateBlock(b, {
                        type: t.type,
                        props: t.props,
                      })
                  }}
                >
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {!isPage && (
          <DropdownMenuItem
            className="text-xs"
            onSelect={() => {
              const b = current()
              if (b) editor.insertBlocks([withNewIds(b)], b, 'after')
            }}
          >
            Duplicate block
          </DropdownMenuItem>
        )}
        {!isPage && <DropdownMenuSeparator />}
        <DropdownMenuItem
          variant="destructive"
          className="text-xs"
          onSelect={() => {
            const b = current()
            if (b) editor.removeBlocks([b])
          }}
        >
          {isPage ? 'Move page to trash' : 'Delete'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
