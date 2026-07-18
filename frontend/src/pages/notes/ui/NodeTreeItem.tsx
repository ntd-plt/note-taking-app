import { cn } from '@/lib/utils'
import type { SidebarItem } from '#/widgets/note-editor/model'
import {
  ChevronRight,
  Copy,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  FolderPlus,
  FilePlus,
  Edit3,
} from 'lucide-react'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const EMOJI_LIST = [
  '📁',
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

interface NoteTreeItemProps {
  item: SidebarItem
  currentNoteId: string | null
  depth: number
  onSelectNote: (id: string) => void
  onAddNote: (folderId: string) => void
  onAddFolder: (parentId: string | null) => void
  onDeleteNote: (id: string, e: React.MouseEvent) => void
  onDeleteFolder: (id: string, e: React.MouseEvent) => void
  onDuplicateNote: (id: string, e: React.MouseEvent) => void
  onToggleFavorite: (id: string) => void
  onToggleFolderExpand: (id: string) => void
  onUpdateFolderIcon: (id: string, icon: string | undefined) => void
  onUpdateNoteIcon: (id: string, icon: string | undefined) => void
  onUpdateFolderName: (id: string, name: string) => void
}

export default function NodeTreeItem({
  item,
  currentNoteId,
  depth,
  onSelectNote,
  onAddNote,
  onAddFolder,
  onDeleteNote,
  onDeleteFolder,
  onDuplicateNote,
  onToggleFavorite,
  onToggleFolderExpand,
  onUpdateFolderIcon,
  onUpdateNoteIcon,
  onUpdateFolderName,
}: NoteTreeItemProps) {
  if (item.type === 'note') {
    const note = item.data
    const isActive = currentNoteId === note.id

    return (
      <div className="flex flex-col">
        <div
          onClick={() => onSelectNote(note.id)}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          className={cn(
            'group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-all duration-150 cursor-pointer relative',
            isActive
              ? 'bg-primary/10 text-primary font-semibold shadow-2xs border-l-2 border-primary pl-[8px]'
              : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground',
          )}
        >
          <div className="flex items-center gap-1.5 truncate w-full pr-14 pl-5">
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
                      onUpdateNoteIcon(note.id, emoji)
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
                    onUpdateNoteIcon(note.id, '📄')
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
                  <span>Delete Note</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  } else {
    // Otherwise, it is a Folder
    const folder = item.data
    const isExpanded = !!folder.isExpanded
    const children = item.children
    const hasChildren = children.length > 0

    const handleToggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleFolderExpand(folder.id)
    }

    const handleRenameFolder = (e: React.MouseEvent) => {
      e.stopPropagation()
      onUpdateFolderName(folder.id, folder.name)
    }

    return (
      <div className="flex flex-col">
        <div
          onClick={handleToggleExpand}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          className="group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-all duration-150 cursor-pointer relative text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
        >
          <div className="flex items-center gap-1 truncate w-full pr-14">
            {/* Chevron Collapse Toggle */}
            <button
              onClick={handleToggleExpand}
              className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/60 transition-all shrink-0 cursor-pointer"
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
                  title="Change Folder Icon"
                >
                  {folder.icon || '📁'}
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
                      onUpdateFolderIcon(folder.id, emoji)
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
                    onUpdateFolderIcon(folder.id, '📁')
                  }}
                  className="col-span-5 text-[10px] text-center text-muted-foreground hover:text-foreground py-1 bg-muted/40 hover:bg-muted rounded transition-all cursor-pointer"
                >
                  Reset Default Icon
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Folder Name */}
            <span className="font-semibold truncate">
              {folder.name || 'Untitled Folder'}
            </span>
          </div>

          {/* Floating Quick Action Buttons on Hover */}
          <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-150 shrink-0">
            {/* Quick Add Note inside Folder */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddNote(folder.id)
              }}
              className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/75 hover:text-primary transition-all cursor-pointer"
              title="Create Note inside"
            >
              <Plus className="h-3 w-3" />
            </button>

            {/* More Actions Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/75 hover:text-foreground transition-all cursor-pointer"
                  title="Folder actions"
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
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddNote(folder.id)
                  }}
                  className="cursor-pointer text-xs"
                >
                  <FilePlus className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Add Note</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddFolder(folder.id)
                  }}
                  className="cursor-pointer text-xs"
                >
                  <FolderPlus className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Add Subfolder</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleRenameFolder}
                  className="cursor-pointer text-xs"
                >
                  <Edit3 className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Rename Folder</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => onDeleteFolder(folder.id, e)}
                  className="cursor-pointer text-destructive hover:text-destructive focus:bg-destructive/10 text-xs"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5 opacity-60 text-destructive" />
                  <span>Delete Folder</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Recursive children tree */}
        {isExpanded && hasChildren && (
          <div className="flex flex-col mt-0.5">
            {children.map((child: SidebarItem) => (
              <NodeTreeItem
                key={child.id}
                item={child}
                currentNoteId={currentNoteId}
                depth={depth + 1}
                onSelectNote={onSelectNote}
                onAddNote={onAddNote}
                onAddFolder={onAddFolder}
                onDeleteNote={onDeleteNote}
                onDeleteFolder={onDeleteFolder}
                onDuplicateNote={onDuplicateNote}
                onToggleFavorite={onToggleFavorite}
                onToggleFolderExpand={onToggleFolderExpand}
                onUpdateFolderIcon={onUpdateFolderIcon}
                onUpdateNoteIcon={onUpdateNoteIcon}
                onUpdateFolderName={onUpdateFolderName}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
}
