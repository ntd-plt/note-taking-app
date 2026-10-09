import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getItemPath } from '#/shared/lib/hierarchy'
import type { Item } from '../model'
import { useItemsQuery } from '../hooks/useItems'
import { useItemsStore } from '../hooks/useItemsStore'

const crumbSeparator = (
  <span className="text-muted-foreground/40 font-normal select-none">
    {'>'}
  </span>
)

export function ItemBreadcrumb({ item }: { item: Item }) {
  const navigate = useNavigate()
  const { data: itemsData } = useItemsQuery()
  const setActiveItemId = useItemsStore((state) => state.setActiveItemId)

  const path = React.useMemo(
    () => getItemPath(item, itemsData ?? []),
    [item, itemsData],
  )

  const openFolder = (folderId: string) => {
    setActiveItemId(folderId)
    navigate({ to: '/items/$itemId', params: { itemId: folderId } })
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground/80 font-medium animate-in fade-in slide-in-from-top-1 duration-200"
    >
      <button
        type="button"
        onClick={() => navigate({ to: '/items' })}
        className="hover:text-foreground transition-colors cursor-pointer"
      >
        Workspace
      </button>
      {path.map((folder) => (
        <React.Fragment key={folder.id}>
          {crumbSeparator}
          <button
            type="button"
            onClick={() => openFolder(folder.id)}
            className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
          >
            <span className="text-xs">{folder.icon || '📁'}</span>
            <span className="max-w-[160px] truncate">{folder.name}</span>
          </button>
        </React.Fragment>
      ))}
      {crumbSeparator}
      <span
        aria-current="page"
        className="flex items-center gap-1 text-foreground/90 font-semibold"
      >
        <span className="text-xs">
          {item.icon || (item.type === 'folder' ? '📁' : '📄')}
        </span>
        <span className="max-w-[160px] truncate">
          {item.name ||
            (item.type === 'folder' ? 'Untitled Folder' : 'Untitled Note')}
        </span>
      </span>
    </nav>
  )
}
