import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Editor } from '@tiptap/react'

import type React from 'react'
import { useBlockHandleStore } from '../state/useBlockHandleStore'

export function BlockEditMenu({ editor }: { editor: Editor | null }) {
  const { state, dispatch, hoverPos } = useBlockHandleStore()
  const position = hoverPos?.rect

  if (!editor || state?.status !== 'open' || !position) return null
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
      <PopoverAnchor
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <PopoverContent
        // Prevent PopoverContent from trying to portal itself relative to a trigger.
        side="left"
        align="start"
        alignOffset={-10}
        sideOffset={30}
        className="w-60 p-0"
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
            <CommandEmpty className="py-6 text-center text-sm text-gray-500">
              No results found
            </CommandEmpty>
            <CommandGroup className="overflow-auto p-1">
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
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded border bg-muted font-mono text-[11px] font-semibold">
                    {renderIcon(item.icon)}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{item.title}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function renderIcon(icon: string | React.ComponentType) {
  if (typeof icon == 'string') {
    return <span>{icon}</span>
  }
  const Icon = icon
  return <Icon />
}
