// The app sidebar: account menu, quick find, the page tree from /pages, and the
// trash link. Pages are dragged with the pointer: onto a page, or between rows
// (see model/sidebarDrop.ts). One page at a time; there is no multi-select.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { showUndoToast } from '#/shared/ui/undoToast'
import { openSettings } from '#/shared/lib/settingsDialog'
import {
  ChevronRight,
  ChevronsUpDown,
  Copy,
  HelpCircle,
  LogOut,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Star,
  StarOff,
  Trash2,
  User,
} from 'lucide-react'
import { logout, validateSession } from '#/shared/api'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '#/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { cn } from '#/lib/utils'
import {
  PROP,
  applyOps,
  duplicateItem,
  fetchItem,
  flushOpenEditor,
  isFavorite,
  itemKeys,
  pageIcon,
  pageName,
  usePages,
  useWorkspace,
} from '#/entities/item'
import type { Item, Op } from '#/entities/item'
import {
  buildPageTree,
  favoritePages,
  isWithin,
  visibleRows,
} from '../model/pageTree'
import type { PageNode } from '../model/pageTree'
import {
  knownChildIds,
  placementToMove,
  pointerToDrop,
  resolveSidebarDrop,
} from '../model/sidebarDrop'
import type { SidebarDrop } from '../model/sidebarDrop'

const ROW_INDENT = 12
// Where a top-level row starts its icon, so it lines up with the text of the
// section labels ("Favorites", "Private"): the label's wrapper px-2 (8px) plus
// SidebarGroupLabel's px-3 (12px), less the row list's px-0.5 (2px).
const ROW_INSET = 18
const DRAG_THRESHOLD = 4

function SidebarOpenButton() {
  const { isMobile, openMobile, state, setOpen, setOpenMobile } = useSidebar()
  if (isMobile ? openMobile : state !== 'collapsed') return null
  return (
    <button
      onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
      title="Open sidebar"
      aria-label="Open sidebar"
      className="fixed left-3 top-3 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/40 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:bg-accent hover:text-foreground"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  )
}

function AccountMenu() {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const [user, setUser] = React.useState<{ name: string } | null>(null)
  React.useEffect(() => {
    void validateSession().then((auth) => {
      if (auth.isAuthenticated && auth.user)
        setUser({ name: auth.user.username || auth.user.email.split('@')[0] })
    })
  }, [])
  const name = user?.name ?? 'User'
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all hover:bg-sidebar-accent/50 focus:outline-none">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 font-semibold text-link shadow-sm ring-1 ring-primary/20">
                {name.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-[10px] font-semibold tracking-wide text-sidebar-foreground">
                {name}
              </span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" sideOffset={6}>
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs"
            onClick={() => void navigate({ to: '/profile' })}
          >
            <User className="mr-2 h-3.5 w-3.5 opacity-60" />
            Profile Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs"
            onClick={() => openSettings()}
          >
            <Settings className="mr-2 h-3.5 w-3.5 opacity-60" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs text-destructive"
            onClick={async () => {
              await logout()
              void navigate({ to: '/login' })
            }}
          >
            <LogOut className="mr-2 h-3.5 w-3.5 opacity-60" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        onClick={toggleSidebar}
        title="Close sidebar"
        aria-label="Close sidebar"
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground/70 transition-all hover:bg-sidebar-accent/60 hover:text-foreground"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
    </div>
  )
}

interface DragState {
  id: string
  drop: SidebarDrop | null
}

export function PageSidebar({ currentId }: { currentId?: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pagesQuery = usePages()
  const workspace = useWorkspace()
  const pages = React.useMemo(() => pagesQuery.data ?? [], [pagesQuery.data])
  const tree = React.useMemo(() => buildPageTree(pages), [pages])
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const rows = React.useMemo(
    () => visibleRows(tree, expanded),
    [tree, expanded],
  )
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  const expand = React.useCallback((ids: (string | null | undefined)[]) => {
    setExpanded((prev) => {
      const add = ids.filter((id): id is string => !!id && !prev.has(id))
      return add.length ? new Set([...prev, ...add]) : prev
    })
  }, [])

  // Keep the open page visible: expand the pages above it.
  React.useEffect(() => {
    if (!currentId) return
    const byId = new Map(pages.map((p) => [p.id, p]))
    const above: string[] = []
    for (
      let p = byId.get(byId.get(currentId)?.parentPageId ?? '');
      p;
      p = byId.get(p.parentPageId ?? '')
    )
      above.push(p.id)
    expand(above)
  }, [currentId, pages, expand])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const open = (id: string) =>
    void navigate({ to: '/items/$itemId', params: { itemId: id } })

  // Sends a change made from the sidebar. When it changes the tree, the open
  // editor saves first, so its positions still match, and reloads afterwards
  // to show the change.
  const refresh = (reloadEditor = true) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: itemKeys.pages }),
      queryClient.invalidateQueries({ queryKey: itemKeys.trash }),
      reloadEditor &&
        queryClient.invalidateQueries({ queryKey: itemKeys.items }),
    ])
  const send = async (ops: Op[]) => {
    await applyOps(ops)
    await refresh()
  }

  // A favorite is a prop the editor never shows, so the editor is left alone.
  const toggleFavorite = async (page: Item) => {
    try {
      await applyOps([
        {
          op: 'update',
          id: page.id,
          props: { [PROP.isFavorite]: !isFavorite(page) },
        },
      ])
      await refresh(false)
    } catch (err) {
      toast.error(`Couldn't update favorites: ${(err as Error).message}`)
    }
  }

  // The copy goes right after the original, in the same parent, and opens.
  const duplicatePage = async (page: Item) => {
    try {
      await flushOpenEditor()
      const copy = await duplicateItem(page.id)
      await refresh()
      open(copy.id)
    } catch (err) {
      toast.error(`Couldn't duplicate the page: ${(err as Error).message}`)
    }
  }

  // undoTrash puts the page back at the end of the parent it was in. If that
  // parent is gone (deleted or trashed meanwhile), it goes to the end of the
  // top level instead.
  const undoTrash = async (page: Item, parentId: string, reopen: boolean) => {
    try {
      await flushOpenEditor()
      try {
        await applyOps([{ op: 'restore', id: page.id, parentId }])
      } catch {
        await applyOps([{ op: 'restore', id: page.id }])
        toast.info(
          `Its old place is gone; "${pageName(page)}" is at the top level`,
        )
      }
      await refresh()
      if (reopen) open(page.id)
    } catch (err) {
      toast.error(`Couldn't restore the page: ${(err as Error).message}`)
    }
  }

  // Trashing hides the page and everything under it. If the open page is among
  // them, leave it first so the editor is not reloaded into a trashed page.
  // Undo in the toast puts it back in the parent it was in.
  const trashPage = async (page: Item) => {
    try {
      await flushOpenEditor()
      const leaving = !!currentId && isWithin(currentId, page.id, pages)
      const reopen = currentId === page.id
      const parentId = page.parentId!
      await applyOps([{ op: 'trash', id: page.id }])
      if (leaving) await navigate({ to: '/items' })
      await refresh()
      showUndoToast(`Moved "${pageName(page)}" to the trash`, () => {
        void undoTrash(page, parentId, reopen)
      })
    } catch (err) {
      toast.error(
        `Couldn't move the page to the trash: ${(err as Error).message}`,
      )
    }
  }

  const actions: PageActions = {
    onToggleFavorite: (p) => void toggleFavorite(p),
    onDuplicate: (p) => void duplicatePage(p),
    onTrash: (p) => void trashPage(p),
  }
  const favorites = favoritePages(pages)

  const addPage = async (parentId: string | undefined) => {
    if (!parentId) return
    const id = crypto.randomUUID()
    try {
      await flushOpenEditor()
      await send([{ op: 'create', id, type: 'page', parentId }])
      expand([parentId])
      open(id)
    } catch (err) {
      toast.error(`Couldn't add a page: ${(err as Error).message}`)
    }
  }

  const movePage = async (draggedId: string, drop: SidebarDrop) => {
    const placement = resolveSidebarDrop(draggedId, drop, rows, pages)
    if (!placement) return
    try {
      await flushOpenEditor()
      let siblings: string[] | undefined
      if (placement.kind === 'beside') {
        siblings = knownChildIds(placement.parentId, pages)
        if (!siblings) {
          // The parent is a block: its children come with the page holding it.
          const holder = pages.find(
            (p) => p.id === placement.anchorId,
          )?.parentPageId
          if (!holder) return
          const opened = await fetchItem(holder)
          siblings = opened.items.find(
            (i) => i.id === placement.parentId,
          )?.childIds
        }
      }
      const op = placementToMove(draggedId, placement, siblings)
      if (!op) return
      await send([op])
      if (placement.kind === 'onto') expand([placement.pageId])
    } catch (err) {
      toast.error(`Couldn't move the page: ${(err as Error).message}`)
    }
  }

  const startDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const from = { x: e.clientX, y: e.clientY }
    let started = false
    let current: DragState | null = null
    const measure = (y: number) => {
      const els =
        listRef.current?.querySelectorAll<HTMLElement>('[data-page-row]')
      const rects = [...(els ?? [])].map((el) => {
        const r = el.getBoundingClientRect()
        return { id: el.dataset.pageRow!, top: r.top, bottom: r.bottom }
      })
      current = { id, drop: pointerToDrop(rects, y) }
      setDrag(current)
    }
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (
          Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < DRAG_THRESHOLD
        )
          return
        started = true
        document.body.style.cursor = 'grabbing'
      }
      measure(ev.clientY)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key, true)
      document.body.style.removeProperty('cursor')
      setDrag(null)
    }
    const up = () => {
      const done = current
      stop()
      if (!started) return
      // The release ends a drag, not a click on the row under the pointer. The
      // browser sends that click right after pointerup, if at all, so the guard
      // only lasts until then.
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(
        () => window.removeEventListener('click', swallow, { capture: true }),
        0,
      )
      if (done?.drop) void movePage(done.id, done.drop)
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key, true)
  }

  // The indicator: a highlighted row, or a line in a gap at the depth of the
  // page the drop is placed beside.
  const placement = drag?.drop
    ? resolveSidebarDrop(drag.id, drag.drop, rows, pages)
    : null
  const ontoId = placement?.kind === 'onto' ? placement.pageId : null
  const lineAt =
    drag?.drop?.kind === 'gap' && placement?.kind === 'beside'
      ? {
          index: drag.drop.index,
          depth: rows.find((r) => r.item.id === placement.anchorId)?.depth ?? 0,
        }
      : null

  const matches = (q: string) =>
    pages.filter((p) => pageName(p).toLowerCase().includes(q.toLowerCase()))
  const [query, setQuery] = React.useState('')

  return (
    <>
      <SidebarOpenButton />
      <Sidebar className="border-r border-sidebar-border/30 bg-sidebar/95 backdrop-blur-md">
        <SidebarHeader className="border-b border-sidebar-border/20 px-4 py-3">
          <AccountMenu />
        </SidebarHeader>

        <SidebarContent className="px-2 pt-2">
          {favorites.length > 0 && (
            <SidebarGroup className="mt-4 p-0">
              <div className="px-2 py-1">
                <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground/80">
                  Favorites
                </SidebarGroupLabel>
              </div>
              <div role="list" aria-label="Favorites" className="px-0.5">
                {favorites.map((p) => (
                  <div
                    key={p.id}
                    role="listitem"
                    onClick={() => open(p.id)}
                    className={cn(
                      'group/row flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pr-1 pl-[18px] text-xs text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent/60',
                      p.id === currentId &&
                        'bg-sidebar-accent font-semibold text-sidebar-foreground',
                    )}
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {pageIcon(p)}
                    </span>
                    <span className="flex-1 truncate">{pageName(p)}</span>
                    <PageMenu page={p} actions={actions} />
                  </div>
                ))}
              </div>
            </SidebarGroup>
          )}

          <SidebarGroup className="mt-4 flex-1 p-0">
            <div className="flex items-center justify-between px-2 py-1">
              <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground/80">
                Private
              </SidebarGroupLabel>
              <button
                onClick={() => void addPage(workspace.data?.id)}
                disabled={!workspace.data}
                className="cursor-pointer rounded-sm p-0.5 text-muted-foreground/60 transition-all hover:bg-sidebar-accent/70 hover:text-primary"
                title="Add a page"
                aria-label="Add a page"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <div
              ref={listRef}
              role="tree"
              aria-label="Pages"
              className="relative px-0.5"
            >
              {pagesQuery.isSuccess && rows.length === 0 && (
                <div className="px-3 py-2 text-[11px] italic text-muted-foreground/60">
                  No pages yet. Click + to add one.
                </div>
              )}
              {rows.map((row, i) => (
                <PageRow
                  key={row.item.id}
                  row={row}
                  active={row.item.id === currentId}
                  expanded={expanded.has(row.item.id)}
                  dragging={drag?.id === row.item.id}
                  dropOnto={ontoId === row.item.id}
                  lineAbove={lineAt?.index === i ? lineAt.depth : undefined}
                  onOpen={() => open(row.item.id)}
                  onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(row.item.id)) next.delete(row.item.id)
                      else next.add(row.item.id)
                      return next
                    })
                  }
                  onAddChild={() => void addPage(row.item.id)}
                  actions={actions}
                  onPointerDown={(e) => startDrag(row.item.id, e)}
                />
              ))}
              {lineAt && lineAt.index === rows.length && (
                <DropLine depth={lineAt.depth} />
              )}
            </div>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/20 px-3 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => void navigate({ to: '/trash' })}
                className="w-full text-muted-foreground/80 transition-all hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4 opacity-75" />
                <span className="text-xs">Trash</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton className="w-full text-muted-foreground/80 hover:bg-sidebar-accent/60">
                <HelpCircle className="mr-2 h-4 w-4 opacity-75" />
                <span className="text-xs">Help & Feedback</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
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
              {matches(query).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    open(p.id)
                    setSearchOpen(false)
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
    </>
  )
}

function location(page: Item, pages: Item[]): string {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const names: string[] = []
  for (
    let p = byId.get(page.parentPageId ?? '');
    p;
    p = byId.get(p.parentPageId ?? '')
  )
    names.unshift(pageName(p))
  return names.join(' / ')
}

function DropLine({ depth }: { depth: number }) {
  return (
    <div
      data-drop-line=""
      className="pointer-events-none h-0.5 rounded-full bg-primary"
      style={{ marginLeft: ROW_INSET + depth * ROW_INDENT }}
    />
  )
}

interface PageActions {
  onToggleFavorite: (page: Item) => void
  onDuplicate: (page: Item) => void
  onTrash: (page: Item) => void
}

// The ⋯ menu of a page row. Its events stay out of the row, which would
// otherwise open the page or start a drag.
function PageMenu({ page, actions }: { page: Item; actions: PageActions }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const favorite = isFavorite(page)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${pageName(page)}`}
          title="More actions"
          onPointerDown={stop}
          onClick={stop}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        onPointerDown={stop}
        onClick={stop}
      >
        <DropdownMenuItem
          className="cursor-pointer text-xs"
          onSelect={() => actions.onToggleFavorite(page)}
        >
          {favorite ? (
            <StarOff className="mr-2 h-3.5 w-3.5 opacity-60" />
          ) : (
            <Star className="mr-2 h-3.5 w-3.5 opacity-60" />
          )}
          {favorite ? 'Remove from favorites' : 'Add to favorites'}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-xs"
          onSelect={() => actions.onDuplicate(page)}
        >
          <Copy className="mr-2 h-3.5 w-3.5 opacity-60" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer text-xs"
          onSelect={() => actions.onTrash(page)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5 opacity-60" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PageRow({
  row,
  active,
  expanded,
  dragging,
  dropOnto,
  lineAbove,
  onOpen,
  onToggle,
  onAddChild,
  actions,
  onPointerDown,
}: {
  row: PageNode
  active: boolean
  expanded: boolean
  dragging: boolean
  dropOnto: boolean
  lineAbove: number | undefined
  onOpen: () => void
  onToggle: () => void
  onAddChild: () => void
  actions: PageActions
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const { item, depth, children } = row
  return (
    <>
      {lineAbove !== undefined && <DropLine depth={lineAbove} />}
      <div
        role="treeitem"
        aria-selected={active}
        aria-expanded={children.length ? expanded : undefined}
        aria-level={depth + 1}
        data-page-row={item.id}
        data-drop-target={dropOnto || undefined}
        onPointerDown={onPointerDown}
        onClick={onOpen}
        style={{ paddingLeft: ROW_INSET + depth * ROW_INDENT }}
        className={cn(
          'group/row flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pr-1 text-xs text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent/60',
          active && 'bg-sidebar-accent font-semibold text-sidebar-foreground',
          dragging && 'opacity-50',
          dropOnto && 'bg-primary/10 ring-2 ring-primary/50',
        )}
      >
        {/* The icon's spot. For a page with children, hovering it (or
            tabbing to the arrow) swaps the icon for the expand/collapse arrow. */}
        <span className="group/icon relative flex h-5 w-4 shrink-0 items-center justify-center">
          <span
            className={cn(
              children.length > 0 &&
                'group-hover/icon:opacity-0 group-has-[:focus-visible]/icon:opacity-0',
            )}
          >
            {pageIcon(item)}
          </span>
          {children.length > 0 && (
            <button
              type="button"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="absolute -inset-0.5 flex items-center justify-center rounded text-muted-foreground opacity-0 outline-none hover:bg-sidebar-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/icon:opacity-100"
            >
              <ChevronRight
                className={cn(
                  'h-3 w-3 transition-transform',
                  expanded && 'rotate-90',
                )}
              />
            </button>
          )}
        </span>
        <span className="flex-1 truncate">{pageName(item)}</span>
        <button
          type="button"
          aria-label={`Add a page inside ${pageName(item)}`}
          title="Add a page inside"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAddChild()
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-0 hover:bg-sidebar-accent group-hover/row:opacity-100"
        >
          <Plus className="h-3 w-3" />
        </button>
        <PageMenu page={item} actions={actions} />
      </div>
    </>
  )
}
