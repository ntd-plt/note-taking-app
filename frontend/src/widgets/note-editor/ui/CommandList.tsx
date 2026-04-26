// CommandList.tsx  (shadcn version — replaces the tippy version entirely)
//
// shadcn components used:
//   npx shadcn@latest add popover command
//
// The extension (SlashCommandExtension.ts) and Editor.tsx are unchanged.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
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

import type { SlashCommandItem } from '../model'
import type { MenuAction, MenuState } from '../model'
import { reducer } from '../api/reducer'

// ─── Event bus ────────────────────────────────────────────────────────────────
// Bridges Tiptap's imperative suggestion lifecycle into React state.

// ─── SlashCommandMenu component ────────────────────────────────────────────────
// Mount this once, anywhere above your editor in the tree (e.g. in Editor.tsx).

export type SlashMenuContextValue = {
  keyDownRef?: any
  state: MenuState
  dispatch: React.Dispatch<MenuAction>
  renderSlashMenu: () => ReturnType<NonNullable<SuggestionOptions['render']>>
}

const SlashMenuContext = createContext<SlashMenuContextValue | null>(null)

export function useSlashMenu() {
  const ctx = useContext(SlashMenuContext)
  if (!ctx)
    throw new Error('useSlashMenu must be used within SlashMenuProvider')
  return ctx
}

export function SlashMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: 'closed' })
  const dispatchRef = useRef(dispatch)
  const keyDownRef = useRef<((p: SuggestionKeyDownProps) => boolean) | null>(
    null,
  )
  const renderSlashMenu = useCallback(
    () => makeRenderSlashMenu(dispatchRef, keyDownRef),
    [],
  )

  const value = useMemo(
    () => ({ state, dispatch, keyDownRef, renderSlashMenu }),
    [state],
  )
  return (
    <SlashMenuContext.Provider value={value}>
      {children}
      <SlashCommandMenu />
    </SlashMenuContext.Provider>
  )
}

export function SlashCommandMenu() {
  const [open, setOpen] = useState(true)
  const { state, dispatch, keyDownRef } = useSlashMenu()
  // Keyboard handler — called by renderSlashMenu's onKeyDown.
  keyDownRef.current = useCallback(
    ({ event }: SuggestionKeyDownProps): boolean => {
      if (state.status !== 'open') return false
      switch (event.key) {
        case 'Escape':
          dispatch({ type: 'CLOSE' })
          return true
        case 'ArrowUp':
          dispatch({ type: 'MOVE', direction: 'up' })
          return true
        case 'ArrowDown':
          dispatch({ type: 'MOVE', direction: 'down' })
          return true
        case 'Enter':
          dispatch({ type: 'SELECT' })
          return true
        default:
          return false
      }
    },
    [state.status, dispatch],
  )
  if (state.status !== 'open') return null
  console.log(state)

  const { items, selectedIndex, position } = state
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
            if (idx !== -1)
              dispatch({
                type: 'MOVE',
                direction: idx > selectedIndex ? 'down' : 'up',
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
                  onSelect={() => {
                    state.command(item)
                    dispatch({ type: 'CLOSE' })
                  }}
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

export function makeRenderSlashMenu(
  dispatchRef: React.RefObject<React.Dispatch<MenuAction>>,
  keyDownRef: React.RefObject<((p: SuggestionKeyDownProps) => boolean) | null>,
): ReturnType<NonNullable<SuggestionOptions['render']>> {
  return {
    onStart(props: SuggestionProps<SlashCommandItem>) {
      dispatchRef.current({ type: 'OPEN', props })
    },

    onUpdate(props: SuggestionProps<SlashCommandItem>) {
      dispatchRef.current({ type: 'UPDATE', props })
    },

    onKeyDown(props: SuggestionKeyDownProps): boolean {
      return keyDownRef?.current?.(props) ?? false
    },

    onExit() {
      dispatchRef.current({ type: 'CLOSE' })
    },
  }
}
