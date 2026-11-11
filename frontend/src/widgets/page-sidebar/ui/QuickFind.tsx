// Quick Find (Ctrl/Cmd+K): search pages by name and open one.
import * as React from 'react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { pageIcon, pageName } from '#/entities/item'
import type { Item } from '#/entities/item'
import { pageAncestors } from '../model/pageTree'

export function QuickFind({
  pages,
  onOpen,
}: {
  pages: Item[]
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const q = query.toLowerCase()
  const matches = pages.filter((p) => pageName(p).toLowerCase().includes(q))

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Quick Find"
      description="Search pages by name"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search pages by name..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-80 overflow-y-auto p-2">
          <CommandEmpty className="py-6 text-center text-xs italic text-muted-foreground/60">
            No pages found.
          </CommandEmpty>
          <CommandGroup heading="Pages">
            {matches.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onOpen(p.id)
                  setOpen(false)
                  setQuery('')
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2"
              >
                <span className="text-base">{pageIcon(p)}</span>
                <div className="flex flex-col truncate">
                  <span className="truncate text-xs font-semibold">
                    {pageName(p)}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground/65">
                    {location(p, pages) || 'Top level'}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

// Where a page sits, as "Work / Projects", or '' at the top level.
const location = (page: Item, pages: readonly Item[]) =>
  pageAncestors(page.id, pages).reverse().map(pageName).join(' / ')
