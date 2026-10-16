import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trash2, Undo2 } from 'lucide-react'
import {
  useDeleteTrashedItem,
  useEmptyTrash,
  useRestoreItems,
  useTrashQuery,
} from '@/widgets/note-editor'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TrashItem } from '@/shared/models'
import { ConfirmDialog } from './ConfirmDialog'
import type { ConfirmRequest } from './ConfirmDialog'

// Padded so the whole crumb, not just its text, is a comfortable click target.
const CRUMB_CLASS = 'rounded-sm px-2 py-1.5'
const CRUMB_LINK_CLASS = `${CRUMB_CLASS} cursor-pointer transition-colors hover:bg-sidebar-accent/70 hover:text-foreground`

const ICON_BUTTON_CLASS =
  'rounded-sm p-1.5 text-muted-foreground/70 hover:bg-sidebar-accent/70 hover:text-primary transition-all cursor-pointer disabled:cursor-default disabled:opacity-50'

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const byFolderThenName = (a: TrashItem, b: TrashItem) => {
  if ((a.type === 'folder') !== (b.type === 'folder')) {
    return a.type === 'folder' ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

/**
 * The trash as a browsable tree. The server keeps it as a flat list, each row pointing at
 * the folder it was in. With no folderId this shows the rows whose folder is not itself in
 * the trash; with one, it shows what was inside that trashed folder.
 */
export function TrashView({ folderId }: { folderId: string | null }) {
  const navigate = useNavigate()
  const { state: sidebarState } = useSidebar()
  const { data, isPending, isError } = useTrashQuery()
  const restoreMutation = useRestoreItems()
  const deleteMutation = useDeleteTrashedItem()
  const emptyMutation = useEmptyTrash()
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)

  const trashed = React.useMemo(() => data ?? [], [data])
  const byId = React.useMemo(
    () => new Map(trashed.map((t) => [t.id, t])),
    [trashed],
  )
  const folder = folderId ? byId.get(folderId) : undefined

  const rows = React.useMemo(
    () =>
      trashed
        .filter((t) =>
          folderId
            ? t.parentId === folderId
            : t.parentId === null || !byId.has(t.parentId),
        )
        .sort(byFolderThenName),
    [trashed, byId, folderId],
  )

  const path = React.useMemo(() => {
    const out: TrashItem[] = []
    const seen = new Set<string>()
    for (
      let cur = folder?.parentId ? byId.get(folder.parentId) : undefined;
      cur && !seen.has(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    ) {
      seen.add(cur.id)
      out.unshift(cur)
    }
    return out
  }, [folder, byId])

  const openFolder = (id: string) =>
    navigate({ to: '/trash/$itemId', params: { itemId: id } })

  const askDelete = (item: TrashItem) =>
    setConfirm({
      title: 'Delete Permanently',
      description:
        item.type === 'folder'
          ? `Permanently delete "${item.name}" and the trashed items inside it? This cannot be undone.`
          : `Permanently delete "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteMutation.mutate(item.id),
    })

  const askEmpty = () =>
    setConfirm({
      title: 'Empty Trash',
      description:
        'Permanently delete everything in the trash? This cannot be undone.',
      confirmLabel: 'Empty Trash',
      onConfirm: () => emptyMutation.mutate(),
    })

  const missing = folderId !== null && !isPending && !isError && !folder
  const title = folder ? folder.name : 'Trash'

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background pt-2">
      <div
        className={cn(
          'flex items-start justify-between gap-4 pr-6 pt-1 pb-1',
          // Clear the floating "open sidebar" button when the sidebar is closed
          sidebarState === 'collapsed' ? 'pl-16' : 'pl-6',
        )}
      >
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-wrap items-center gap-x-0.5 text-xs font-medium text-muted-foreground/80"
        >
          {folderId === null ? (
            <span
              aria-current="page"
              className={`${CRUMB_CLASS} font-semibold text-foreground/90`}
            >
              Trash
            </span>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ to: '/trash' })}
              className={CRUMB_LINK_CLASS}
            >
              Trash
            </button>
          )}
          {path.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <span aria-hidden>/</span>
              <button
                type="button"
                onClick={() => openFolder(crumb.id)}
                className={`${CRUMB_LINK_CLASS} flex items-center gap-1`}
              >
                <span className="text-xs">{crumb.icon || '📁'}</span>
                <span className="max-w-[160px] truncate">{crumb.name}</span>
              </button>
            </React.Fragment>
          ))}
          {folder && (
            <>
              <span aria-hidden>/</span>
              <span
                aria-current="page"
                className={`${CRUMB_CLASS} flex items-center gap-1 font-semibold text-foreground/90`}
              >
                <span className="text-xs">{folder.icon || '📁'}</span>
                <span className="max-w-[160px] truncate">{folder.name}</span>
              </span>
            </>
          )}
        </nav>
      </div>

      <div className="mx-auto w-full max-w-4xl px-8 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="select-none text-4xl">
              {folder ? folder.icon || '📁' : '🗑️'}
            </span>
            <h1 className="truncate font-heading text-4xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          {folderId === null && (
            <Button
              variant="destructive"
              disabled={trashed.length === 0}
              onClick={askEmpty}
            >
              Empty Trash
            </Button>
          )}
        </div>
        <hr className="my-4 border-border/30" />

        {isPending && (
          <p className="py-6 text-sm text-muted-foreground/70">Loading…</p>
        )}
        {isError && (
          <p className="py-6 text-sm text-destructive">
            Could not load the trash.
          </p>
        )}
        {missing && (
          <p className="py-6 text-sm italic text-muted-foreground/70">
            This folder is no longer in the trash.
          </p>
        )}
        {!isPending && !isError && !missing && rows.length === 0 && (
          <p className="py-6 text-sm italic text-muted-foreground/70">
            {folder ? 'This folder is empty.' : 'The trash is empty.'}
          </p>
        )}
        {rows.length > 0 && (
          <ul aria-label="Trash contents" className="flex flex-col gap-0.5">
            {rows.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="shrink-0 text-lg" aria-hidden>
                  {item.icon || (item.type === 'folder' ? '📁' : '📄')}
                </span>
                {item.type === 'folder' ? (
                  <button
                    type="button"
                    onClick={() => openFolder(item.id)}
                    title="Show what is inside"
                    className="min-w-0 flex-1 cursor-pointer truncate text-left font-semibold"
                  >
                    {item.name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  Deleted {formatDate(item.deletedAt)}
                </span>
                <button
                  type="button"
                  className={ICON_BUTTON_CLASS}
                  aria-label={`Restore ${item.name}`}
                  title="Restore"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate([item.id])}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(ICON_BUTTON_CLASS, 'hover:text-destructive')}
                  aria-label={`Delete ${item.name} permanently`}
                  title="Delete permanently"
                  onClick={() => askDelete(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
