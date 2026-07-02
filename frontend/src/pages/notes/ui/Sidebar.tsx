import * as React from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useNotesStore, type Note } from '@/widgets/note-editor'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  MoreHorizontal,
  Search,
  Settings,
  Star,
  Trash2,
  Copy,
  ChevronsUpDown,
  LogOut,
  User,
  CreditCard,
  PlusCircle,
  HelpCircle,
  Undo,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Beautiful, curated list of standard emojis for Notion pages
const EMOJI_LIST = [
  '📄',
  '🚀',
  '💡',
  '📝',
  '💼',
  '📅',
  '🎯',
  '🏠',
  '🛒',
  '🎬',
  '🔑',
  '🎨',
  '🍕',
  '⚡',
  '🍀',
]

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

export function AppSidebar({ data: initialData }: NodeSidebarProps) {
  const navigate = useNavigate()
  const { isMobile } = useSidebar()

  // Zustand store bindings
  const {
    notes,
    activeNoteId,
    searchQuery,
    addNote,
    deleteNote,
    updateNoteTitle,
    updateNoteIcon,
    toggleFavorite,
    toggleExpand,
    setActiveNoteId,
    setSearchQuery,
    duplicateNote,
  } = useNotesStore()

  // Find active note from URL params if available
  const params = useParams({ strict: false }) as { noteId?: string }
  const currentNoteId = params.noteId || activeNoteId

  React.useEffect(() => {
    if (params.noteId && params.noteId !== activeNoteId) {
      setActiveNoteId(params.noteId)
    }
  }, [params.noteId, activeNoteId, setActiveNoteId])

  // Search dialog state
  const [searchOpen, setSearchOpen] = React.useState(false)

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

  // Workspace selector state
  const [currentWorkspace, setCurrentWorkspace] =
    React.useState('Personal Workspace')

  // Group notes into tree hierarchy
  const buildNoteTree = (parentId: string | null): Note[] => {
    return notes
      .filter((n) => n.parentId === parentId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
  }

  const rootNotes = buildNoteTree(null)
  const favoriteNotes = notes.filter((n) => n.isFavorite)

  // Handlers
  const handleCreateNewPage = (parentId: string | null = null) => {
    const title = parentId ? 'Untitled Sub-page' : 'Untitled Note'
    const newId = addNote(parentId, title)
    navigate({
      to: '/notes/$noteId',
      params: { noteId: newId },
    })
  }

  const handleDeletePage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    deleteNote(id)
    // If deleted the current note, navigate back to notes index or first available note
    if (currentNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id)
      if (remaining.length > 0) {
        navigate({
          to: '/notes/$noteId',
          params: { noteId: remaining[0].id },
        })
      } else {
        navigate({ to: '/notes' })
      }
    }
  }

  const handleDuplicatePage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const newId = duplicateNote(id)
    if (newId) {
      navigate({
        to: '/notes/$noteId',
        params: { noteId: newId },
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
                    <span className="text-xs font-semibold tracking-wide text-sidebar-foreground">
                      {currentWorkspace}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
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
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                Workspaces
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => setCurrentWorkspace('Personal Workspace')}
                  className={cn(
                    'flex items-center justify-between text-xs px-2 py-1.5 cursor-pointer',
                    currentWorkspace === 'Personal Workspace' &&
                      'bg-sidebar-accent font-medium text-primary',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏠</span> Personal Workspace
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setCurrentWorkspace('Work Workspace')}
                  className={cn(
                    'flex items-center justify-between text-xs px-2 py-1.5 cursor-pointer',
                    currentWorkspace === 'Work Workspace' &&
                      'bg-sidebar-accent font-medium text-primary',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">💼</span> Work Workspace
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="text-xs px-2 py-1.5 cursor-pointer">
                  <User className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Profile Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs px-2 py-1.5 cursor-pointer">
                  <CreditCard className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Billing & Plan</span>
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

        {/* Sidebar Main Navigation Content */}
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
                    console.log('Hello')
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
                          toggleFavorite(note.id)
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
              <button
                onClick={() => handleCreateNewPage(null)}
                className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary transition-all"
                title="Create a new root page"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <SidebarGroupContent>
              {rootNotes.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground/60 italic">
                  No pages yet. Click + to add one.
                </div>
              ) : (
                <SidebarMenu className="space-y-0.5 px-0.5">
                  {rootNotes.map((note) => (
                    <NoteTreeItem
                      key={note.id}
                      note={note}
                      allNotes={notes}
                      currentNoteId={currentNoteId}
                      depth={0}
                      onSelectNote={handleSelectNote}
                      onAddSubNote={handleCreateNewPage}
                      onDeleteNote={handleDeletePage}
                      onDuplicateNote={handleDuplicatePage}
                      onToggleFavorite={toggleFavorite}
                      onToggleExpand={toggleExpand}
                      onUpdateIcon={updateNoteIcon}
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
                    <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full font-semibold opacity-70">
                      {notes.length === 0 ? 0 : 0}
                    </span>
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
                        if (
                          confirm(
                            'Reset all notes to initial state? This will clear custom notes.',
                          )
                        ) {
                          localStorage.removeItem(
                            'note-taking-workspace-storage',
                          )
                          window.location.reload()
                        }
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
    </>
  )
}

interface NoteTreeItemProps {
  note: Note
  allNotes: Note[]
  currentNoteId: string | null
  depth: number
  onSelectNote: (id: string) => void
  onAddSubNote: (parentId: string) => void
  onDeleteNote: (id: string, e: React.MouseEvent) => void
  onDuplicateNote: (id: string, e: React.MouseEvent) => void
  onToggleFavorite: (id: string) => void
  onToggleExpand: (id: string) => void
  onUpdateIcon: (id: string, icon: string | undefined) => void
}

function NoteTreeItem({
  note,
  allNotes,
  currentNoteId,
  depth,
  onSelectNote,
  onAddSubNote,
  onDeleteNote,
  onDuplicateNote,
  onToggleFavorite,
  onToggleExpand,
  onUpdateIcon,
}: NoteTreeItemProps) {
  const children = allNotes
    .filter((n) => n.parentId === note.id)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )

  const hasChildren = children.length > 0
  const isExpanded = !!note.isExpanded
  const isActive = currentNoteId === note.id

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleExpand(note.id)
  }

  return (
    <div className="flex flex-col">
      <div
        onClick={() => onSelectNote(note.id)}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
        className={cn(
          'group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-all duration-150 cursor-pointer relative',
          isActive
            ? 'bg-primary/10 text-primary font-semibold shadow-2xs border-l-2 border-primary pl-[6px]'
            : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground',
        )}
      >
        <div className="flex items-center gap-1 truncate w-full pr-14">
          {/* Chevron Collapse Toggle */}
          <button
            onClick={handleToggleExpand}
            className={cn(
              'p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/60 transition-all shrink-0',
              !hasChildren && 'opacity-0 cursor-default',
            )}
            disabled={!hasChildren}
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 transform transition-transform duration-200',
                isExpanded && 'rotate-90 text-primary',
              )}
            />
          </button>

          {/* Emoji Icon Button with Dropdown picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-sm px-0.5 rounded hover:bg-sidebar-accent-foreground/10 shrink-0 select-none cursor-pointer transition-all"
                title="Change Emoji"
              >
                {note.icon || '📄'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="p-2 grid grid-cols-5 gap-1 w-44"
              align="start"
            >
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation()
                    onUpdateIcon(note.id, emoji)
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-sidebar-accent transition-all cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
              <DropdownMenuSeparator className="col-span-5 my-1" />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdateIcon(note.id, '📄')
                }}
                className="col-span-5 text-[10px] text-center text-muted-foreground hover:text-foreground py-1 bg-muted/40 hover:bg-muted rounded transition-all cursor-pointer"
              >
                Reset Default Icon
              </button>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Note Title */}
          <span className="truncate">{note.title || 'Untitled Note'}</span>
        </div>

        {/* Floating Quick Action Buttons on Hover */}
        <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-150 shrink-0">
          {/* Quick Add Sub-Page */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSubNote(note.id)
            }}
            className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/75 hover:text-primary transition-all"
            title="Add a sub-page"
          >
            <Plus className="h-3 w-3" />
          </button>

          {/* More Actions Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/75 hover:text-foreground transition-all"
                title="More actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-44 text-xs"
              align="end"
              side="right"
              sideOffset={5}
            >
              <DropdownMenuItem
                onClick={() => onToggleFavorite(note.id)}
                className="cursor-pointer text-xs"
              >
                <Star
                  className={cn(
                    'mr-2 h-3.5 w-3.5 opacity-60',
                    note.isFavorite && 'fill-primary text-primary opacity-100',
                  )}
                />
                <span>
                  {note.isFavorite ? 'Unfavorite' : 'Add to Favorites'}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => onDuplicateNote(note.id, e)}
                className="cursor-pointer text-xs"
              >
                <Copy className="mr-2 h-3.5 w-3.5 opacity-60" />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => onDeleteNote(note.id, e)}
                className="cursor-pointer text-destructive hover:text-destructive focus:bg-destructive/10 text-xs"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5 opacity-60 text-destructive" />
                <span>Delete Page</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Recursive children tree */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col mt-0.5">
          {children.map((child) => (
            <NoteTreeItem
              key={child.id}
              note={child}
              allNotes={allNotes}
              currentNoteId={currentNoteId}
              depth={depth + 1}
              onSelectNote={onSelectNote}
              onAddSubNote={onAddSubNote}
              onDeleteNote={onDeleteNote}
              onDuplicateNote={onDuplicateNote}
              onToggleFavorite={onToggleFavorite}
              onToggleExpand={onToggleExpand}
              onUpdateIcon={onUpdateIcon}
            />
          ))}
        </div>
      )}
    </div>
  )
}
