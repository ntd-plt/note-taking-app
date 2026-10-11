import * as React from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { validateSession, logout } from '@/shared/api'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import {
  useItemsStore,
  useItemsQuery,
  useCreateItem,
  useDeleteItem,
  useDuplicateItem,
  useUpdateItem,
} from '@/widgets/note-editor'
import type { SidebarItem } from '@/widgets/note-editor'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup as CmdGroup,
  CommandInput,
  CommandItem as CmdItem,
  CommandList,
  Command,
} from '@/components/ui/command'
import {
  ChevronRight,
  FilePlus,
  Search,
  Settings,
  Trash2,
  ChevronsUpDown,
  LogOut,
  User,
  HelpCircle,
  Undo,
  FolderPlus,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import NodeTreeItem from './NodeTreeItem'
import { ROOT_DROP_ID, flattenVisible } from '../model/treeDnd'
import { buildTree } from '../model/buildTree'
import { getItemPath } from '@/shared/lib/hierarchy'
import { TreeInteractionProvider } from '../model/TreeInteractionContext'
import { useTreeSelection } from '../model/useTreeSelection'
import { useTreeDragAndDrop } from '../model/useTreeDragAndDrop'

export interface NoteSidebarData {
  spaces: {
    name: string
    notes: {
      url: string
      title: string
      isActive: boolean
    }[]
  }[]
}

export interface NodeSidebarProps {
  data?: NoteSidebarData
}

/**
 * Floating button anchored to the top-left of the page, shown only while the
 * sidebar is closed, that opens it again.
 */
function SidebarOpenButton() {
  const { isMobile, openMobile, state, setOpen, setOpenMobile } = useSidebar()
  const isClosed = isMobile ? !openMobile : state === 'collapsed'

  if (!isClosed) return null

  return (
    <button
      onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
      title="Open sidebar"
      aria-label="Open sidebar"
      className="fixed left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-md border border-border/40 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:bg-accent hover:text-foreground cursor-pointer animate-in fade-in slide-in-from-left-2 duration-200"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  )
}

/**
 * The tree area. Dropping on it (and not on a row) moves the dragged items to the top level.
 */
function TreeDropZone({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: (e: React.MouseEvent<HTMLElement>) => void
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: ROOT_DROP_ID })
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      data-testid="tree-blank-area"
      data-drop-target={active || undefined}
      className={cn(
        'min-h-16 flex-1 rounded-md transition-colors',
        active && 'bg-primary/10 ring-2 ring-primary/50',
      )}
    >
      {children}
    </div>
  )
}

export function AppSidebar() {
  const navigate = useNavigate()
  const { toggleSidebar } = useSidebar()
  const [user, setUser] = React.useState<{
    name: string
    email: string
  } | null>(null)

  React.useEffect(() => {
    validateSession().then((auth) => {
      if (auth.isAuthenticated && auth.user) {
        setUser({
          name: auth.user.username || auth.user.email.split('@')[0],
          email: auth.user.email,
        })
      }
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate({ to: '/login' })
  }

  const { data: itemsData } = useItemsQuery()
  const items = React.useMemo(() => itemsData ?? [], [itemsData])

  // Zustand store bindings
  const { activeItemId, searchQuery, setActiveItemId, setSearchQuery } =
    useItemsStore()

  const params = useParams({ strict: false })
  const currentItemId = params.itemId || activeItemId

  // Mutation hooks
  const createItemMutation = useCreateItem()
  const deleteItemMutation = useDeleteItem()
  const duplicateItemMutation = useDuplicateItem()
  const { updateItemNow } = useUpdateItem()

  React.useEffect(() => {
    if (params.itemId) setActiveItemId(params.itemId)
  }, [params.itemId, setActiveItemId])

  // Search dialog state
  const [searchOpen, setSearchOpen] = React.useState(false)

  // Expanded folders state
  const [expandedFolders, setExpandedFolders] = React.useState<
    Record<string, boolean>
  >({})

  // Dialog State
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false)
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(
    null,
  )
  const [folderNameInput, setFolderNameInput] = React.useState('')

  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
  const [confirmDialogData, setConfirmDialogData] = React.useState<{
    title: string
    description: string
    confirmLabel: string
    isDestructive?: boolean
    onConfirm: () => void
  }>({
    title: '',
    description: '',
    confirmLabel: '',
    onConfirm: () => {},
  })

  const openRenameDialog = (folderId: string, currentName: string) => {
    setFolderNameInput(currentName)
    setRenameFolderId(folderId)
    setRenameDialogOpen(true)
  }

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = folderNameInput.trim()
    if (name === '') return

    if (renameFolderId) {
      updateItemNow(renameFolderId, { name })
    }
    setRenameDialogOpen(false)
  }

  // Keyboard shortcut for quick find
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const sidebarTree = React.useMemo(
    () => buildTree(items, expandedFolders),
    [items, expandedFolders],
  )

  // Multi-select and drag-and-drop over the tree
  const visibleIds = React.useMemo(
    () => flattenVisible(sidebarTree),
    [sidebarTree],
  )
  const treeSelection = useTreeSelection(items, visibleIds)
  const dnd = useTreeDragAndDrop({
    items,
    selectedIds: treeSelection.selectedIds,
    onSelectOnly: treeSelection.replaceWith,
    onDropInto: (destinationId) => {
      if (destinationId) {
        setExpandedFolders((prev) => ({ ...prev, [destinationId]: true }))
      }
    },
    onDropped: treeSelection.clear,
  })
  const treeInteraction = React.useMemo(
    () => ({
      selectedIds: treeSelection.selectedIds,
      invalidTargetIds: dnd.invalidTargetIds,
      draggingIds: dnd.draggingIds,
      dropFolderId: dnd.dropFolderId,
      onRowClick: treeSelection.onRowClick,
    }),
    [
      treeSelection.selectedIds,
      treeSelection.onRowClick,
      dnd.invalidTargetIds,
      dnd.draggingIds,
      dnd.dropFolderId,
    ],
  )
  const dragLabel = (() => {
    if (dnd.dragged.length === 0) return ''
    if (dnd.dragged.length > 1) return `${dnd.dragged.length} items`
    return items.find((i) => i.id === dnd.dragged[0])?.name
  })()

  // Handlers
  const handleOpen = (id: string) => {
    setActiveItemId(id)
    navigate({
      to: '/items/$itemId',
      params: { itemId: id },
    })
  }

  const handleCreateNewPage = (parentId: string | null = null) => {
    createItemMutation.mutate(
      { type: 'note', parentId, name: 'Untitled Note' },
      {
        onSuccess: (newNote) => {
          navigate({
            to: '/items/$itemId',
            params: { itemId: newNote.id },
          })
          if (parentId) {
            setExpandedFolders((prev) => ({
              ...prev,
              [parentId]: true,
            }))
          }
        },
      },
    )
  }

  const handleCreateNewFolder = (parentId: string | null = null) => {
    createItemMutation.mutate({
      type: 'folder',
      parentId,
      name: 'New Folder',
    })
    if (parentId) {
      setExpandedFolders((prev) => ({ ...prev, [parentId]: true }))
    }
  }

  const openItem = items.find((i) => i.id === currentItemId)
  const createParentId = !openItem
    ? null
    : openItem.type === 'folder'
      ? openItem.id
      : openItem.parentId

  const handleBlankClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target)) return
    if (e.ctrlKey || e.metaKey || e.shiftKey) return
    if (target.closest('[data-tree-row], button, a, input')) return
    treeSelection.clear()
    void Promise.resolve(navigate({ to: '/items' })).then(() =>
      setActiveItemId(null),
    )
  }

  const handleDelete = (item: SidebarItem, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const isFolder = item.type === 'folder'
    setConfirmDialogData({
      title: isFolder ? 'Delete Folder' : 'Delete Note',
      description: isFolder
        ? 'Are you sure you want to delete this folder and all its contents?'
        : 'Are you sure you want to delete this note permanently?',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: () => {
        deleteItemMutation.mutate(item.id, {
          onSuccess: () => {
            const nextActiveId = useItemsStore.getState().activeItemId
            if (nextActiveId) {
              navigate({
                to: '/items/$itemId',
                params: { itemId: nextActiveId },
              })
            } else {
              navigate({ to: '/items' })
            }
          },
        })
      },
    })
    setConfirmDialogOpen(true)
  }

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    duplicateItemMutation.mutate(id, {
      onSuccess: (copy) => {
        if (copy.type === 'note') {
          navigate({
            to: '/items/$itemId',
            params: { itemId: copy.id },
          })
        }
      },
    })
  }

  const searchMatches = items.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const initials = user ? user.name.substring(0, 2).toUpperCase() : 'U'
  const displayName = user ? user.name : 'User'

  return (
    <>
      <SidebarOpenButton />
      <Sidebar className="border-r border-sidebar-border/30 bg-sidebar/95 backdrop-blur-md">
        {/* Workspace Profile Switcher Header */}
        <SidebarHeader className="border-b border-sidebar-border/20 px-4 py-3">
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all hover:bg-sidebar-accent/50 focus:outline-none">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary font-heading font-semibold shadow-sm ring-1 ring-primary/20">
                      {initials}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] font-semibold tracking-wide text-sidebar-foreground">
                        {displayName} (Free Plan)
                      </span>
                    </div>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="start"
                side="bottom"
                sideOffset={6}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem className="text-xs px-2 py-1.5 cursor-pointer">
                    <User className="mr-2 h-3.5 w-3.5 opacity-60" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-xs text-destructive hover:text-destructive px-2 py-1.5 cursor-pointer"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={toggleSidebar}
              title="Close sidebar"
              aria-label="Close sidebar"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground/70 transition-all hover:bg-sidebar-accent/60 hover:text-foreground cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </SidebarHeader>

        {/* Sidebar Navigation Content */}
        <SidebarContent className="px-2 pt-2">
          {/* Quick Actions Group */}
          <SidebarGroup className="p-0">
            <SidebarMenu>
              {/* Quick Find Search Button */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setSearchOpen(true)}
                  className="w-full text-muted-foreground/90 transition-all hover:bg-sidebar-accent/60"
                >
                  <Search className="mr-2 h-4 w-4 text-muted-foreground/75" />
                  <span className="text-xs font-medium">Quick Find</span>
                  <kbd className="ml-auto inline-flex h-4 select-none items-center gap-0.5 rounded border border-sidebar-border/30 bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground/80">
                    <span className="text-[10px]">⌘</span>K
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Settings Trigger */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="w-full text-muted-foreground/90 transition-all hover:bg-sidebar-accent/60"
                  onClick={() => {
                    navigate({
                      to: '/',
                    })
                    console.log('Settings clicked')
                  }}
                >
                  <Settings className="mr-2 h-4 w-4 text-muted-foreground/75" />
                  <span className="text-xs font-medium">
                    Settings & Members
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Private Notes COLLAPSIBLE Group */}
          <TreeInteractionProvider value={treeInteraction}>
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={dnd.collisionDetection}
              onDragStart={dnd.onDragStart}
              onDragOver={dnd.onDragOver}
              onDragEnd={dnd.onDragEnd}
              onDragCancel={dnd.onDragCancel}
            >
              <SidebarGroup className="mt-4 flex-1 p-0">
                <div
                  onClick={handleBlankClick}
                  className="flex cursor-pointer items-center justify-between px-2 py-1"
                >
                  <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                    Private
                  </SidebarGroupLabel>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCreateNewPage(createParentId)}
                      className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary transition-all cursor-pointer"
                      title="Create New Note"
                      aria-label="Create New Note"
                    >
                      <FilePlus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleCreateNewFolder(createParentId)}
                      className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary transition-all cursor-pointer"
                      title="Create New Folder"
                      aria-label="Create New Folder"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {dnd.moveError && (
                  <div
                    role="alert"
                    className="mx-2 mb-1 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
                  >
                    <span className="flex-1">
                      Couldn't move items: {dnd.moveError}
                    </span>
                    <button
                      onClick={dnd.dismissMoveError}
                      aria-label="Dismiss"
                      className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <TreeDropZone
                  active={dnd.dropOnRoot}
                  onClick={handleBlankClick}
                >
                  <SidebarGroupContent>
                    {sidebarTree.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-muted-foreground/60 italic">
                        No pages yet. Click + to add one.
                      </div>
                    ) : (
                      <SidebarMenu className="space-y-0.5 px-0.5">
                        {sidebarTree.map((item) => (
                          <NodeTreeItem
                            key={item.id}
                            item={item}
                            currentItemId={currentItemId}
                            depth={0}
                            onOpen={handleOpen}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            onToggleFolderExpand={(id) => {
                              setExpandedFolders((prev) => ({
                                ...prev,
                                [id]: !prev[id],
                              }))
                            }}
                            onUpdateIcon={(id, icon) => {
                              updateItemNow(id, { icon })
                            }}
                            onRenameFolder={(id, name) => {
                              openRenameDialog(id, name)
                            }}
                          />
                        ))}
                      </SidebarMenu>
                    )}
                  </SidebarGroupContent>
                </TreeDropZone>
              </SidebarGroup>
              <DragOverlay dropAnimation={null}>
                {dnd.dragged.length > 0 && (
                  <div className="w-fit max-w-56 truncate rounded-md border border-primary/40 bg-sidebar px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground shadow-lg">
                    {dragLabel || 'Untitled'}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </TreeInteractionProvider>
        </SidebarContent>

        {/* Sidebar Footer */}
        <SidebarFooter className="border-t border-sidebar-border/20 px-3 py-2">
          <SidebarMenu>
            {/* Trash Action */}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="w-full text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-all">
                    <Trash2 className="mr-2 h-4 w-4 opacity-75" />
                    <span className="text-xs">Archive / Trash</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-64 p-2 text-xs"
                  align="start"
                  side="top"
                >
                  <div className="flex flex-col gap-1 p-1">
                    <span className="font-semibold text-foreground">
                      Trash Can
                    </span>
                    <span className="text-[10px] text-muted-foreground mb-1">
                      No deleted pages. Deleting pages is permanent in this
                      mock.
                    </span>
                    <DropdownMenuSeparator />
                    <button
                      onClick={() => {
                        setConfirmDialogData({
                          title: 'Reset Workspace',
                          description:
                            'Are you sure you want to reset all notes to the initial state? This will clear all your custom notes.',
                          confirmLabel: 'Restore Default',
                          isDestructive: true,
                          onConfirm: () => {
                            localStorage.removeItem('items-workspace-storage')
                            window.location.reload()
                          },
                        })
                        setConfirmDialogOpen(true)
                      }}
                      className="flex w-full items-center gap-1.5 justify-center py-1.5 px-2 text-[10px] text-destructive bg-destructive/5 hover:bg-destructive/15 rounded border border-destructive/20 font-medium transition-all"
                    >
                      <Undo className="h-3 w-3" /> Restore Default Workspace
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>

            {/* Help & Support */}
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

      {/* Sleek Command Palette Quick Find Dialog */}
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Quick Find"
        description="Search notes and folders by name"
        className="w-full max-w-lg border border-border/40 shadow-2xl backdrop-blur-lg bg-popover/95 rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <Command>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
            <CommandInput
              placeholder="Search pages and folders by name..."
              className="flex-1 py-1.5 text-sm bg-transparent outline-none border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
          </div>
          <CommandList className="max-h-80 overflow-y-auto p-2">
            {searchMatches.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-xs text-muted-foreground/60 italic flex flex-col items-center gap-1 justify-center">
                <span>No pages found matching your search.</span>
              </CommandEmpty>
            ) : (
              <CmdGroup
                heading="Matching Items"
                className="text-muted-foreground/80 text-[10px] font-bold px-2 py-1 uppercase tracking-wider"
              >
                {searchMatches.map((item) => {
                  const location = getItemPath(item, items)
                    .map((folder) => folder.name)
                    .join(' / ')
                  return (
                    <CmdItem
                      key={item.id}
                      value={`${item.name} ${item.id}`}
                      onSelect={() => {
                        handleOpen(item.id)
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-sidebar-accent cursor-pointer transition-all duration-100 group"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base shrink-0">
                          {item.icon || (item.type === 'folder' ? '📁' : '📄')}
                        </span>
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {item.name ||
                              (item.type === 'folder'
                                ? 'Untitled Folder'
                                : 'Untitled Note')}
                          </span>
                          <span className="text-[10px] text-muted-foreground/65 truncate max-w-sm">
                            {location || 'Top level'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                    </CmdItem>
                  )
                })}
              </CmdGroup>
            )}
          </CommandList>
          <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border/10 text-[9px] text-muted-foreground/85">
            <div className="flex items-center gap-3">
              <span>💡 Tip: Click items or use arrows to navigate</span>
            </div>
            <div>
              <span>ESC to close</span>
            </div>
          </div>
        </Command>
      </CommandDialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleRenameSubmit}>
            <DialogHeader>
              <DialogTitle>Rename Folder</DialogTitle>
              <DialogDescription>
                Enter a new name for the folder.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center space-x-2 py-4">
              <Input
                id="folder-name"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                placeholder="Folder Name"
                className="flex-1"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialogData.title}</DialogTitle>
            <DialogDescription>
              {confirmDialogData.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={
                confirmDialogData.isDestructive ? 'destructive' : 'default'
              }
              onClick={() => {
                confirmDialogData.onConfirm()
                setConfirmDialogOpen(false)
              }}
            >
              {confirmDialogData.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
