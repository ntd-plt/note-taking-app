import * as React from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  useNotesStore,
  useNotesQuery,
  useFoldersQuery,
  useCreateNote,
  useDeleteNote,
  useDuplicateNote,
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder,
  useUpdateNote,
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
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  ChevronsUpDown,
  LogOut,
  User,
  PlusCircle,
  HelpCircle,
  Undo,
  FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import NoteTreeItem from './NodeTreeItem'

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

export function AppSidebar() {
  const navigate = useNavigate()

  const { data: notes = [] } = useNotesQuery()
  const { data: folders = [] } = useFoldersQuery()
  console.log("Folder", JSON.stringify(folders))
  console.log("Notes", JSON.stringify(notes))

  // Zustand store bindings
  const { activeNoteId, searchQuery, setActiveNoteId, setSearchQuery } =
    useNotesStore()

  // Find active note from URL params if available
  const params = useParams({ strict: false })
  const currentNoteId = params.noteId || activeNoteId

  // Mutation hooks
  const createNoteMutation = useCreateNote()
  const deleteNoteMutation = useDeleteNote()
  const duplicateNoteMutation = useDuplicateNote()
  const { updateNote } = useUpdateNote()

  const createFolderMutation = useCreateFolder()
  const deleteFolderMutation = useDeleteFolder()
  const updateFolderMutation = useUpdateFolder()

  React.useEffect(() => {
    if (params.noteId && params.noteId !== activeNoteId) {
      setActiveNoteId(params.noteId)
    }
  }, [params.noteId, activeNoteId, setActiveNoteId])

  // Search dialog state
  const [searchOpen, setSearchOpen] = React.useState(false)

  // Dialog State
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [folderDialogMode, setFolderDialogMode] = React.useState<'create' | 'rename'>('create')
  const [folderDialogParentId, setFolderDialogParentId] = React.useState<string | null>(null)
  const [folderDialogId, setFolderDialogId] = React.useState<string | null>(null)
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
    onConfirm: () => { },
  })

  const openFolderDialog = (mode: 'create' | 'rename', parentIdOrFolderId: string | null, currentName = '') => {
    setFolderDialogMode(mode)
    setFolderNameInput(currentName)
    if (mode === 'create') {
      setFolderDialogParentId(parentIdOrFolderId)
      setFolderDialogId(null)
    } else {
      setFolderDialogParentId(null)
      setFolderDialogId(parentIdOrFolderId)
    }
    setFolderDialogOpen(true)
  }

  const handleFolderDialogSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = folderNameInput.trim()
    if (name === '') return

    if (folderDialogMode === 'create') {
      createFolderMutation.mutate({ parentId: folderDialogParentId, name })
    } else if (folderDialogId) {
      updateFolderMutation.mutate({ id: folderDialogId, updates: { name } })
    }
    setFolderDialogOpen(false)
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

  // Construct combined folders & notes hierarchical tree
  const sidebarTree = React.useMemo(() => {
    const rootItems: SidebarItem[] = []
    const itemsByParent: Record<string, SidebarItem[]> = {}


    // Group folders
    folders?.forEach((folder) => {
      const item: SidebarItem = {
        type: 'folder',
        id: folder.id,
        data: folder,
        children: [],
      }

      if (folder.parentId === null) {
        rootItems.push(item)
      } else {
        itemsByParent[folder.parentId] = itemsByParent[folder.parentId] || []
        itemsByParent[folder.parentId].push(item)
      }
    })

    // Group notes
    notes?.forEach((note) => {
      const item: SidebarItem = {
        type: 'note',
        id: note.id,
        data: note,
      }

      if (note.parentId === null) {
        rootItems.push(item)
      } else {
        itemsByParent[note.parentId] = itemsByParent[note.parentId] || []
        itemsByParent[note.parentId].push(item)
      }
    })

    // Recursively wire children (folders first, then notes)
    const assemble = (items: SidebarItem[]) => {
      items.forEach((item) => {
        if (item.type === 'folder') {
          const children = itemsByParent[item.id] || []
          item.children = children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
            const nameA = a.type === 'folder' ? a.data.name : a.data.title
            const nameB = b.type === 'folder' ? b.data.name : b.data.title
            return nameA.localeCompare(nameB)
          })
          assemble(item.children)
        }
      })
    }

    assemble(rootItems)

    // Sort top-level items
    return rootItems.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      const nameA = a.type === 'folder' ? a.data.name : a.data.title
      const nameB = b.type === 'folder' ? b.data.name : b.data.title
      return nameA.localeCompare(nameB)
    })
  }, [folders, notes])

  const favoriteNotes = notes.filter((n) => n.isFavorite)

  // Handlers
  const handleCreateNewPage = (parentId: string | null = null) => {
    createNoteMutation.mutate(
      { parentId, title: 'Untitled Note' },
      {
        onSuccess: (newNote) => {
          navigate({
            to: '/notes/$noteId',
            params: { noteId: newNote.id },
          })
        },
      }
    )
  }

  const handleCreateNewFolder = (parentId: string | null = null) => {
    openFolderDialog('create', parentId, 'New Folder')
  }

  const handleDeletePage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setConfirmDialogData({
      title: 'Delete Note',
      description: 'Are you sure you want to delete this note permanently?',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: () => {
        deleteNoteMutation.mutate(id, {
          onSuccess: () => {
            const nextActiveId = useNotesStore.getState().activeNoteId
            if (nextActiveId) {
              navigate({
                to: '/notes/$noteId',
                params: { noteId: nextActiveId },
              })
            } else {
              navigate({ to: '/notes' })
            }
          },
        })
      },
    })
    setConfirmDialogOpen(true)
  }

  const handleDeleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setConfirmDialogData({
      title: 'Delete Folder',
      description: 'Are you sure you want to delete this folder and all its contents?',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: () => {
        deleteFolderMutation.mutate(id, {
          onSuccess: () => {
            const nextActiveId = useNotesStore.getState().activeNoteId
            if (nextActiveId) {
              navigate({
                to: '/notes/$noteId',
                params: { noteId: nextActiveId },
              })
            } else {
              navigate({ to: '/notes' })
            }
          },
        })
      },
    })
    setConfirmDialogOpen(true)
  }

  const handleDuplicatePage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const note = notes.find((n) => n.id === id)
    if (note) {
      duplicateNoteMutation.mutate(note, {
        onSuccess: (newNote) => {
          navigate({
            to: '/notes/$noteId',
            params: { noteId: newNote.id },
          })
        },
      })
    }
  }

  const handleSelectNote = (id: string) => {
    setActiveNoteId(id)
    navigate({
      to: '/notes/$noteId',
      params: { noteId: id },
    })
  }

  return (
    <>
      <Sidebar className="border-r border-sidebar-border/30 bg-sidebar/95 backdrop-blur-md">
        {/* Workspace Profile Switcher Header */}
        <SidebarHeader className="border-b border-sidebar-border/20 px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all hover:bg-sidebar-accent/50 focus:outline-none">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary font-heading font-semibold shadow-sm ring-1 ring-primary/20">
                    TP
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] font-semibold tracking-wide text-sidebar-foreground">
                      Lam Tung (Free Plan)
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
              <DropdownMenuItem className="text-xs text-destructive hover:text-destructive px-2 py-1.5 cursor-pointer">
                <LogOut className="mr-2 h-3.5 w-3.5 opacity-60" />
                <span>Log Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

              {/* Create new Top-Level Page */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleCreateNewPage(null)}
                  className="w-full text-muted-foreground/90 transition-all hover:bg-sidebar-accent/60 hover:text-primary"
                >
                  <PlusCircle className="mr-2 h-4 w-4 text-primary/70" />
                  <span className="text-xs font-medium">Add New Page</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Favorites COLLAPSIBLE Group */}
          {favoriteNotes.length > 0 && (
            <SidebarGroup className="mt-4 p-0">
              <SidebarGroupLabel className="flex w-full items-center justify-between text-[10px] font-bold tracking-wider text-muted-foreground/80 px-2 py-1 uppercase">
                Favorites
              </SidebarGroupLabel>
              <SidebarMenu>
                {favoriteNotes.map((note) => (
                  <SidebarMenuItem key={`fav-${note.id}`}>
                    <div
                      onClick={() => handleSelectNote(note.id)}
                      className={cn(
                        'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-all duration-150 cursor-pointer',
                        currentNoteId === note.id
                          ? 'bg-primary/10 text-primary font-medium shadow-2xs border-l-2 border-primary pl-[6px]'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm shrink-0">
                          {note.icon || '📄'}
                        </span>
                        <span className="truncate">
                          {note.title || 'Untitled Note'}
                        </span>
                      </div>

                      {/* Unfavorite Quick Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          updateNote(note.id, { isFavorite: false })
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground hover:text-primary transition-all shrink-0"
                        title="Remove from Favorites"
                      >
                        <Star className="h-3 w-3 fill-primary text-primary" />
                      </button>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}

          {/* Private Notes COLLAPSIBLE Group */}
          <SidebarGroup className="mt-4 p-0">
            <div className="flex items-center justify-between px-2 py-1">
              <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                Private Pages
              </SidebarGroupLabel>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCreateNewFolder(null)}
                  className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary transition-all cursor-pointer"
                  title="Create a new root folder"
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleCreateNewPage(null)}
                  className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary transition-all cursor-pointer"
                  title="Create a new root note"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <SidebarGroupContent>
              {sidebarTree.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground/60 italic">
                  No pages yet. Click + to add one.
                </div>
              ) : (
                <SidebarMenu className="space-y-0.5 px-0.5">
                  {sidebarTree.map((item) => (
                    <NoteTreeItem
                      key={item.id}
                      item={item}
                      currentNoteId={currentNoteId}
                      depth={0}
                      onSelectNote={handleSelectNote}
                      onAddNote={handleCreateNewPage}
                      onAddFolder={handleCreateNewFolder}
                      onDeleteNote={handleDeletePage}
                      onDeleteFolder={handleDeleteFolder}
                      onDuplicateNote={handleDuplicatePage}
                      onToggleFavorite={(id) => {
                        const note = notes.find((n) => n.id === id)
                        if (note)
                          updateNote(id, { isFavorite: !note.isFavorite })
                      }}
                      onToggleFolderExpand={(id) => {
                        const f = folders.find((fol) => fol.id === id)
                        if (f)
                          updateFolderMutation.mutate({
                            id,
                            updates: { isExpanded: !f.isExpanded },
                          })
                      }}
                      onUpdateFolderIcon={(id, icon) => {
                        updateFolderMutation.mutate({ id, updates: { icon } })
                      }}
                      onUpdateNoteIcon={(id, icon) => {
                        updateNote(id, { icon })
                      }}
                      onUpdateFolderName={(id, name) => {
                        updateFolderMutation.mutate({ id, updates: { name } })
                      }}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
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
                          description: 'Are you sure you want to reset all notes to the initial state? This will clear all your custom notes.',
                          confirmLabel: 'Restore Default',
                          isDestructive: true,
                          onConfirm: () => {
                            localStorage.removeItem('note-taking-workspace-storage')
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
        description="Search notes by title or content"
        className="w-full max-w-lg border border-border/40 shadow-2xl backdrop-blur-lg bg-popover/95 rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <Command>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
            <Search className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
            <CommandInput
              placeholder="Search pages, headings or contents..."
              className="flex-1 py-1.5 text-sm bg-transparent outline-none border-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
          </div>
          <CommandList className="max-h-80 overflow-y-auto p-2">
            {notes.filter(
              (n) =>
                n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                n.content.toLowerCase().includes(searchQuery.toLowerCase()),
            ).length === 0 ? (
              <CommandEmpty className="py-6 text-center text-xs text-muted-foreground/60 italic flex flex-col items-center gap-1 justify-center">
                <span>No pages found matching your search.</span>
              </CommandEmpty>
            ) : (
              <CmdGroup
                heading="Matching Notes"
                className="text-muted-foreground/80 text-[10px] font-bold px-2 py-1 uppercase tracking-wider"
              >
                {notes
                  .filter(
                    (n) =>
                      n.title
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      n.content
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()),
                  )
                  .map((note) => (
                    <CmdItem
                      key={note.id}
                      onSelect={() => {
                        handleSelectNote(note.id)
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-sidebar-accent cursor-pointer transition-all duration-100 group"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base shrink-0">
                          {note.icon || '📄'}
                        </span>
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {note.title || 'Untitled Note'}
                          </span>
                          <span className="text-[10px] text-muted-foreground/65 truncate max-w-sm">
                            {note.content
                              .replace(/<[^>]*>/g, ' ')
                              .substring(0, 70)}
                            ...
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                    </CmdItem>
                  ))}
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

      {/* Folder Name Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleFolderDialogSubmit}>
            <DialogHeader>
              <DialogTitle>
                {folderDialogMode === 'create' ? 'Create Folder' : 'Rename Folder'}
              </DialogTitle>
              <DialogDescription>
                {folderDialogMode === 'create'
                  ? 'Enter a name for the new folder.'
                  : 'Enter a new name for the folder.'}
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
                onClick={() => setFolderDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {folderDialogMode === 'create' ? 'Create' : 'Save'}
              </Button>
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
              variant={confirmDialogData.isDestructive ? 'destructive' : 'default'}
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
