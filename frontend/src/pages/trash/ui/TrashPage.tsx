// The trash: pages moved there, with Restore and Delete forever, and Empty trash.
// /trash/$itemId previews a trashed page read-only.
import * as React from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import {
  pageIcon,
  pageName,
  useDeleteFromTrash,
  useEmptyTrash,
  useRestoreFromTrash,
  useTrash,
} from '#/entities/item'
import type { Item } from '#/entities/item'
import { PageView } from '#/widgets/block-editor'
import { PageSidebar } from '#/widgets/page-sidebar'
import { errorMessage } from '#/shared/lib/errors'
import { formatDate } from '#/shared/lib/format'
import { ConfirmDialog } from '#/shared/ui/ConfirmDialog'

const DAY_MS = 24 * 60 * 60 * 1000

export const daysLeft = (purgeAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(purgeAt) - now) / DAY_MS))

// The restore and delete actions, shared by the list and the preview.
function useTrashActions() {
  const restore = useRestoreFromTrash()
  const remove = useDeleteFromTrash()
  return {
    restore: async (page: Item) => {
      try {
        await restore.mutateAsync(page.id)
        toast.success(`Restored "${pageName(page)}"`)
        return true
      } catch (err) {
        toast.error(`Couldn't restore the page: ${errorMessage(err)}`)
        return false
      }
    },
    remove: async (page: Item) => {
      try {
        await remove.mutateAsync(page.id)
        toast.success(`Deleted "${pageName(page)}" for good`)
        return true
      } catch (err) {
        toast.error(`Couldn't delete the page: ${errorMessage(err)}`)
        return false
      }
    },
  }
}

function TrashList() {
  const trash = useTrash()
  const actions = useTrashActions()
  const empty = useEmptyTrash()
  const [confirm, setConfirm] = React.useState<
    { kind: 'one'; page: Item } | { kind: 'all' } | null
  >(null)
  const pages = trash.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Trash</h1>
          <p className="text-xs text-muted-foreground">
            Pages here are deleted for good 30 days after they were moved here.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pages.length === 0}
          onClick={() => setConfirm({ kind: 'all' })}
        >
          Empty trash
        </Button>
      </div>

      {trash.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {trash.isError && (
        <p role="alert" className="text-sm text-destructive">
          The trash could not be loaded.
        </p>
      )}
      {trash.isSuccess && pages.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          The trash is empty.
        </p>
      )}

      <ul aria-label="Pages in the trash" className="flex flex-col gap-1">
        {pages.map(({ page, purgeAt }) => (
          <li
            key={page.id}
            className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60"
          >
            <span className="text-lg">{pageIcon(page)}</span>
            <Link
              to="/trash/$itemId"
              params={{ itemId: page.id }}
              className="flex min-w-0 flex-1 flex-col"
            >
              <span className="truncate text-sm font-medium">
                {pageName(page)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                Trashed {formatDate(page.trashedAt!)} · {daysLeft(purgeAt)} days
                left
              </span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Restore ${pageName(page)}`}
              onClick={() => void actions.restore(page)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${pageName(page)} forever`}
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm({ kind: 'one', page })}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete forever
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === 'one'
            ? `Delete "${pageName(confirm.page)}" forever?`
            : 'Empty the trash?'
        }
        description={
          confirm?.kind === 'one'
            ? 'The page and everything in it will be deleted. This cannot be undone.'
            : `All ${pages.length} pages in the trash, and everything in them, will be deleted. This cannot be undone.`
        }
        confirmLabel={
          confirm?.kind === 'one' ? 'Delete forever' : 'Empty trash'
        }
        onConfirm={() => {
          if (confirm?.kind === 'one') void actions.remove(confirm.page)
          else
            empty.mutate(undefined, {
              onError: (err) =>
                toast.error(`Couldn't empty the trash: ${errorMessage(err)}`),
            })
        }}
      />
    </div>
  )
}

function TrashPreview({ itemId }: { itemId: string }) {
  const navigate = useNavigate()
  const actions = useTrashActions()
  const [confirmDelete, setConfirmDelete] = React.useState<Item | null>(null)
  return (
    <>
      <PageView
        itemId={itemId}
        trashBanner={(page) => (
          <div className="flex items-center gap-3 bg-destructive/10 px-6 py-2 text-xs text-destructive">
            {page.trashedAt ? (
              <>
                <span className="flex-1">This page is in the trash.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (await actions.restore(page))
                      void navigate({
                        to: '/items/$itemId',
                        params: { itemId: page.id },
                      })
                  }}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(page)}
                >
                  Delete forever
                </Button>
              </>
            ) : (
              <span className="flex-1">
                This page is inside a page in the trash. Restore that page to
                bring it back.
              </span>
            )}
            <Link to="/trash" className="underline underline-offset-2">
              Back to trash
            </Link>
          </div>
        )}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete ? pageName(confirmDelete) : ''}" forever?`}
        description="The page and everything in it will be deleted. This cannot be undone."
        confirmLabel="Delete forever"
        onConfirm={async () => {
          if (confirmDelete && (await actions.remove(confirmDelete)))
            void navigate({ to: '/trash' })
        }}
      />
    </>
  )
}

export function TrashPage() {
  const { itemId } = useParams({ strict: false })
  return (
    <SidebarProvider>
      <PageSidebar />
      <SidebarInset className="flex h-screen flex-col overflow-hidden bg-background">
        {itemId ? <TrashPreview itemId={itemId} /> : <TrashList />}
      </SidebarInset>
    </SidebarProvider>
  )
}
