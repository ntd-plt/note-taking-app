import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '#/components/ui/command'
import { Popover, PopoverContent } from '@/components/ui/popover'

export type EditorMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  position: { top: number; left: number }
}
export function EditorMenu({ open, onOpenChange, position }: EditorMenuProps) {
  // const { items, selectedIndex, position } = state
  // const selectedValue = items[selectedIndex]?.title ?? ''

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
                  }}
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
