import { cn } from '@/lib/utils'
import type { SidebarItem } from '#/widgets/note-editor/model'
import { DEFAULT_ICONS } from '#/shared/models'
import { ChevronRight, Copy, MoreHorizontal, Trash2, Edit3 } from 'lucide-react'
import * as React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useTreeInteraction } from '../model/TreeInteractionContext'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const SELECTED_ROW_CLASS =
  'bg-blue-500/25 ring-1 ring-blue-500/60 text-sidebar-foreground hover:bg-blue-500/30'

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

interface NodeTreeItemProps {
  item: SidebarItem
  currentItemId: string | null
  depth: number
  onOpen: (id: string) => void
  onDelete: (item: SidebarItem, e: React.MouseEvent) => void
  onDuplicate: (id: string, e: React.MouseEvent) => void
  onToggleFolderExpand: (id: string) => void
  onUpdateIcon: (id: string, icon: string) => void
  onRenameFolder: (id: string, currentName: string) => void
}

function IconPicker({
  item,
  onUpdateIcon,
}: {
  item: SidebarItem
  onUpdateIcon: (id: string, icon: string) => void
}) {
  const defaultIcon = DEFAULT_ICONS[item.type]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="text-sm px-0.5 rounded hover:bg-sidebar-accent-foreground/10 shrink-0 select-none cursor-pointer transition-all"
          title={item.type === 'folder' ? 'Change Folder Icon' : 'Change Emoji'}
        >
          {item.data.icon || defaultIcon}
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
              onUpdateIcon(item.id, emoji)
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
            onUpdateIcon(item.id, defaultIcon)
          }}
          className="col-span-5 text-[10px] text-center text-muted-foreground hover:text-foreground py-1 bg-muted/40 hover:bg-muted rounded transition-all cursor-pointer"
        >
          Reset Default Icon
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function NodeTreeItem({
  item,
  currentItemId,
  depth,
  onOpen,
  onDelete,
  onDuplicate,
  onToggleFolderExpand,
  onUpdateIcon,
  onRenameFolder,
}: NodeTreeItemProps) {
  const { selectedIds, draggingIds, dropFolderId, onRowClick } =
    useTreeInteraction()
  const isSelected = selectedIds.has(item.id)
  const isDragging = draggingIds.has(item.id)
  const isActive = currentItemId === item.id

  // Every row can be dragged. Rows are also drop zones: a folder receives the drop itself
  // and a note stands for its parent folder (resolved by the sidebar, not here).
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: item.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: item.id })
  const setRowRef = React.useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  if (item.type === 'note') {
    const note = item.data

    return (
      <div className="flex flex-col">
        <div
          ref={setRowRef}
          {...attributes}
          {...listeners}
          role={undefined}
          data-tree-row
          data-selected={isSelected || undefined}
          onClick={(e) => onRowClick(item.id, e, () => onOpen(item.id))}
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          className={cn(
            'group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-all duration-150 cursor-pointer relative',
            isActive
              ? 'bg-primary/10 text-primary font-semibold shadow-2xs border-l-2 border-primary pl-[8px]'
              : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground',
            isSelected && SELECTED_ROW_CLASS,
            isDragging && 'opacity-40',
          )}
        >
          <div className="flex items-center gap-1.5 truncate w-full pr-14 pl-5">
            <IconPicker item={item} onUpdateIcon={onUpdateIcon} />

            <span className="truncate">{note.name || 'Untitled Note'}</span>
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
                  onClick={(e) => onDuplicate(note.id, e)}
                  className="cursor-pointer text-xs"
                >
                  <Copy className="mr-2 h-3.5 w-3.5 opacity-60" />
                  <span>Duplicate</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => onDelete(item, e)}
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
  }

  // Otherwise, it is a Folder
  const folder = item.data
  const isExpanded = item.isExpanded
  const children = item.children
  const hasChildren = children.length > 0

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFolderExpand(folder.id)
  }

  const handleRenameFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRenameFolder(folder.id, folder.name)
  }

  return (
    <div className="flex flex-col">
      <div
        ref={setRowRef}
        {...attributes}
        {...listeners}
        role={undefined}
        data-tree-row
        data-selected={isSelected || undefined}
        data-drop-target={dropFolderId === folder.id || undefined}
        onClick={(e) => onRowClick(item.id, e, () => onOpen(item.id))}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
        className={cn(
          'group flex items-center justify-between rounded-md py-1.5 pr-2 text-xs transition-all duration-150 cursor-pointer relative',
          isActive
            ? 'bg-primary/10 text-primary shadow-2xs border-l-2 border-primary pl-[8px]'
            : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-foreground',
          isSelected && SELECTED_ROW_CLASS,
          isDragging && 'opacity-40',
          dropFolderId === folder.id &&
            'bg-primary/25 text-sidebar-foreground ring-2 ring-primary',
        )}
      >
        <div className="flex items-center gap-1 truncate w-full pr-14">
          {/* Chevron Collapse Toggle */}
          <button
            onClick={handleToggleExpand}
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            aria-expanded={isExpanded}
            className="p-0.5 rounded-sm hover:bg-sidebar-accent-foreground/10 text-muted-foreground/60 transition-all shrink-0 cursor-pointer"
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 transform transition-transform duration-200',
                isExpanded && 'rotate-90 text-primary',
              )}
            />
          </button>

          <IconPicker item={item} onUpdateIcon={onUpdateIcon} />

          {/* Folder Name */}
          <span className="font-semibold truncate">
            {folder.name || 'Untitled Folder'}
          </span>
        </div>

        {/* Floating Quick Action Buttons on Hover */}
        <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-150 shrink-0">
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
                onClick={handleRenameFolder}
                className="cursor-pointer text-xs"
              >
                <Edit3 className="mr-2 h-3.5 w-3.5 opacity-60" />
                <span>Rename Folder</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => onDuplicate(folder.id, e)}
                className="cursor-pointer text-xs"
              >
                <Copy className="mr-2 h-3.5 w-3.5 opacity-60" />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => onDelete(item, e)}
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
              currentItemId={currentItemId}
              depth={depth + 1}
              onOpen={onOpen}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onToggleFolderExpand={onToggleFolderExpand}
              onUpdateIcon={onUpdateIcon}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
