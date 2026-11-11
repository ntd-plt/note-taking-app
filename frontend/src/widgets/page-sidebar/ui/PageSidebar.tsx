// The app sidebar: account menu, quick find, the page tree from /pages, and the
// trash link. Pages are dragged with the pointer: onto a page, or between rows
// (see model/sidebarDrop.ts). One page at a time; there is no multi-select.
import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  Copy,
  HelpCircle,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react'
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
import { cn } from '#/lib/utils'
import {
  isFavorite,
  pageIcon,
  pageName,
  usePages,
  useWorkspace,
} from '#/entities/item'
import type { Item } from '#/entities/item'
import {
  buildPageTree,
  favoritePages,
  pageAncestors,
  visibleRows,
} from '../model/pageTree'
import type { PageNode } from '../model/pageTree'
import { pointerToDrop, resolveSidebarDrop } from '../model/sidebarDrop'
import type { SidebarDrop } from '../model/sidebarDrop'
import { usePageActions } from '../model/usePageActions'
import type { PageActions } from '../model/usePageActions'
import { AccountMenu } from './AccountMenu'
import { QuickFind } from './QuickFind'

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

interface DragState {
  id: string
  drop: SidebarDrop | null
}

export function PageSidebar({ currentId }: { currentId?: string | null }) {
  const navigate = useNavigate()
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
    expand(pageAncestors(currentId, pages).map((p) => p.id))
  }, [currentId, pages, expand])

  const { open, actions, addPage, movePage } = usePageActions({
    currentId,
    pages,
    rows,
    expand,
  })
  const favorites = favoritePages(pages)

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

      <QuickFind pages={pages} onOpen={open} />
    </>
  )
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
