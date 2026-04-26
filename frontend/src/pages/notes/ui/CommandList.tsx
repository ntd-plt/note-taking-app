// CommandList.tsx  (shadcn version — replaces the tippy version entirely)
//
// shadcn components used:
//   npx shadcn@latest add popover command
//
// The extension (SlashCommandExtension.ts) and Editor.tsx are unchanged.

import React, { useEffect, useRef, useState } from 'react'
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from '@tiptap/suggestion'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent } from '@/components/ui/popover'

import type { SlashCommandItem } from './SlashCommandExtension'

// ─── Event bus ────────────────────────────────────────────────────────────────
// Bridges Tiptap's imperative suggestion lifecycle into React state.

type MenuEvent =
  | { type: 'open'; props: SuggestionProps<SlashCommandItem> }
  | { type: 'update'; props: SuggestionProps<SlashCommandItem> }
  | { type: 'close' }

type MenuEventHandler = (event: MenuEvent) => void

class SlashMenuBus {
  private handlers = new Set<MenuEventHandler>()

  emit(event: MenuEvent) {
    this.handlers.forEach((h) => h(event))
  }

  subscribe(handler: MenuEventHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }
}

// One shared bus per app — lives outside React so the suggestion callbacks can reach it.
export const slashMenuBus = new SlashMenuBus()

// ─── SlashCommandMenu component ────────────────────────────────────────────────
// Mount this once, anywhere above your editor in the tree (e.g. in Editor.tsx).

export function SlashCommandMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SlashCommandItem[]>([])
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Hold a ref to the current suggestion props so we can call props.command later.
  const propsRef = useRef<SuggestionProps<SlashCommandItem> | null>(null)
  // Expose the keyboard handler back to the suggestion lifecycle.
  const keyDownRef = useRef<((p: SuggestionKeyDownProps) => boolean) | null>(
    null,
  )

  useEffect(() => {
    // Register the keydown handler on the bus so renderSlashMenu can call it.
    slashMenuBus['_keyDownRef'] = keyDownRef

    return slashMenuBus.subscribe((event) => {
      if (event.type === 'open' || event.type === 'update') {
        propsRef.current = event.props
        setItems(event.props.items)
        setSelectedIndex(0)

        const rect = event.props.clientRect?.()
        if (rect) {
          setPosition({
            top: rect.bottom + window.scrollY + 6,
            left: rect.left + window.scrollX,
          })
        }

        setOpen(true)
      } else {
        setOpen(false)
        propsRef.current = null
      }
    })
  }, [])

  // Keyboard handler — called by renderSlashMenu's onKeyDown.
  keyDownRef.current = ({ event }: SuggestionKeyDownProps): boolean => {
    if (!open) return false

    if (event.key === 'Escape') {
      setOpen(false)
      return true
    }
    if (event.key === 'ArrowUp') {
      setSelectedIndex((i) => (i - 1 + items.length) % items.length)
      return true
    }
    if (event.key === 'ArrowDown') {
      setSelectedIndex((i) => (i + 1) % items.length)
      return true
    }
    if (event.key === 'Enter') {
      selectItem(items[selectedIndex])
      return true
    }
    return false
  }

  const selectItem = (item: SlashCommandItem | undefined) => {
    if (!item || !propsRef.current) return
    propsRef.current.command(item)
    setOpen(false)
  }

  if (!position) return null
  const selectedValue = items[selectedIndex]?.title ?? ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          left: position.left,
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
            if (idx !== -1) setSelectedIndex(idx)
          }}
        >
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {items.map((item, index) => (
                <CommandItem
                  key={item.title}
                  value={item.title}
                  onSelect={() => selectItem(item)}
                  data-selected={index === selectedIndex}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded border bg-muted font-mono text-[11px] font-semibold">
                    {item.icon}
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

// ─── renderSlashMenu ───────────────────────────────────────────────────────────
// Same signature as before — just fires bus events instead of managing tippy.

export function renderSlashMenu(): ReturnType<
  NonNullable<SuggestionOptions['render']>
> {
  return {
    onStart(props: SuggestionProps<SlashCommandItem>) {
      slashMenuBus.emit({ type: 'open', props })
    },

    onUpdate(props: SuggestionProps<SlashCommandItem>) {
      slashMenuBus.emit({ type: 'update', props })
    },

    onKeyDown(props: SuggestionKeyDownProps): boolean {
      const ref = slashMenuBus['_keyDownRef'] as
        | React.RefObject<((p: SuggestionKeyDownProps) => boolean) | null>
        | undefined
      return ref?.current?.(props) ?? false
    },

    onExit() {
      slashMenuBus.emit({ type: 'close' })
    },
  }
}
