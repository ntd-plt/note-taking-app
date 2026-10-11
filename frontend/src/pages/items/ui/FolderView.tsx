import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FilePlus, FolderPlus } from 'lucide-react'
import {
  ItemBreadcrumb,
  useCreateItem,
  useItemsQuery,
  useItemsStore,
} from '@/widgets/note-editor'
import type { Item } from '@/widgets/note-editor'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { sortItems } from '@/shared/lib/hierarchy'

const ICON_BUTTON_CLASS =
  'rounded-sm p-1 text-muted-foreground/60 hover:bg-sidebar-accent/70 hover:text-primary active:text-primary transition-all cursor-pointer'

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function FolderView({ folder }: { folder: Item }) {
  const navigate = useNavigate()
  const { state: sidebarState } = useSidebar()
  const { data: itemsData } = useItemsQuery()
  const setActiveItemId = useItemsStore((state) => state.setActiveItemId)
  const createItem = useCreateItem()

  const children = React.useMemo(
    () => sortItems((itemsData ?? []).filter((i) => i.parentId === folder.id)),
    [itemsData, folder.id],
  )

  const open = (id: string) => {
    setActiveItemId(id)
    navigate({ to: '/items/$itemId', params: { itemId: id } })
  }

  const addNote = () => {
    createItem.mutate({
      type: 'note',
      parentId: folder.id,
      name: 'Untitled Note',
      activate: false,
    })
  }

  const addFolder = () => {
    createItem.mutate({
      type: 'folder',
      parentId: folder.id,
      name: 'New Folder',
    })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background pt-2">
      <div
        className={cn(
          'flex items-start justify-between gap-4 pr-6 pt-1 pb-1',
          // Clear the floating "open sidebar" button when the sidebar is closed
          sidebarState === 'collapsed' ? 'pl-16' : 'pl-6',
        )}
      >
        <ItemBreadcrumb item={folder} />
      </div>

      <div className="mx-auto w-full max-w-4xl px-8 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-4xl select-none">{folder.icon || '📁'}</span>
            <h1 className="truncate font-heading text-4xl font-extrabold tracking-tight text-foreground">
              {folder.name || 'Untitled Folder'}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={addNote}
              className={ICON_BUTTON_CLASS}
              title="New note"
              aria-label="New note"
            >
              <FilePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={addFolder}
              className={ICON_BUTTON_CLASS}
              title="New folder"
              aria-label="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <hr className="my-4 border-border/30" />

        {children.length === 0 ? (
          <p className="py-6 text-sm italic text-muted-foreground/70">
            This folder is empty.
          </p>
        ) : (
          <ul aria-label="Folder contents" className="flex flex-col gap-0.5">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => open(child.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="shrink-0 text-lg">
                    {child.icon || (child.type === 'folder' ? '📁' : '📄')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      child.type === 'folder' && 'font-semibold',
                    )}
                  >
                    {child.name ||
                      (child.type === 'folder'
                        ? 'Untitled Folder'
                        : 'Untitled Note')}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground/70">
                    {formatDate(child.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
