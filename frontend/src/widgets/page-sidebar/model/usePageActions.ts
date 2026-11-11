// What the sidebar does to pages: open, add, move, favorite, duplicate and
// trash (with undo). Each change saves the open editor first, so its positions
// still match, and reports a failure in a toast.
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  PROP,
  fetchItem,
  flushOpenEditor,
  isFavorite,
  pageName,
  useApplyOps,
  useDuplicateItem,
} from '#/entities/item'
import type { Item, Op } from '#/entities/item'
import { errorMessage } from '#/shared/lib/errors'
import { showUndoToast } from '#/shared/ui/undoToast'
import { isWithin } from './pageTree'
import type { PageNode } from './pageTree'
import {
  knownChildIds,
  placementToMove,
  resolveSidebarDrop,
} from './sidebarDrop'
import type { SidebarDrop } from './sidebarDrop'

export interface PageActions {
  onToggleFavorite: (page: Item) => void
  onDuplicate: (page: Item) => void
  onTrash: (page: Item) => void
}

export function usePageActions({
  currentId,
  pages,
  rows,
  expand,
}: {
  currentId?: string | null
  pages: Item[]
  rows: PageNode[]
  expand: (ids: (string | null | undefined)[]) => void
}) {
  const navigate = useNavigate()
  const { mutateAsync: applyOps } = useApplyOps()
  const { mutateAsync: duplicateItem } = useDuplicateItem()

  const open = (id: string) =>
    void navigate({ to: '/items/$itemId', params: { itemId: id } })

  // Reloads the open editor afterwards, to show the change.
  const send = (ops: Op[]) => applyOps({ ops })

  // A favorite is a prop the editor never shows, so the editor is left alone.
  const toggleFavorite = async (page: Item) => {
    try {
      await applyOps({
        ops: [
          {
            op: 'update',
            id: page.id,
            props: { [PROP.isFavorite]: !isFavorite(page) },
          },
        ],
        editor: 'keep',
      })
    } catch (err) {
      toast.error(`Couldn't update favorites: ${errorMessage(err)}`)
    }
  }

  // The copy goes right after the original, in the same parent, and opens.
  const duplicatePage = async (page: Item) => {
    try {
      await flushOpenEditor()
      const copy = await duplicateItem(page.id)
      open(copy.id)
    } catch (err) {
      toast.error(`Couldn't duplicate the page: ${errorMessage(err)}`)
    }
  }

  // undoTrash puts the page back at the end of the parent it was in. If that
  // parent is gone (deleted or trashed meanwhile), it goes to the end of the
  // top level instead.
  const undoTrash = async (page: Item, parentId: string, reopen: boolean) => {
    try {
      await flushOpenEditor()
      try {
        await send([{ op: 'restore', id: page.id, parentId }])
      } catch {
        await send([{ op: 'restore', id: page.id }])
        toast.info(
          `Its old place is gone; "${pageName(page)}" is at the top level`,
        )
      }
      if (reopen) open(page.id)
    } catch (err) {
      toast.error(`Couldn't restore the page: ${errorMessage(err)}`)
    }
  }

  // Trashing hides the page and everything under it. If the open page is among
  // them, leave it first so the editor is not reloaded into a trashed page.
  // Undo in the toast puts it back in the parent it was in.
  const trashPage = async (page: Item) => {
    try {
      await flushOpenEditor()
      const leaving = !!currentId && isWithin(currentId, page.id, pages)
      const reopen = currentId === page.id
      const parentId = page.parentId!
      // When leaving, the open page is only marked stale: reloading it now
      // would show it trashed before the navigation.
      await applyOps({
        ops: [{ op: 'trash', id: page.id }],
        editor: leaving ? 'stale' : 'reload',
      })
      if (leaving) await navigate({ to: '/items' })
      showUndoToast(`Moved "${pageName(page)}" to the trash`, () => {
        void undoTrash(page, parentId, reopen)
      })
    } catch (err) {
      toast.error(`Couldn't move the page to the trash: ${errorMessage(err)}`)
    }
  }

  const actions: PageActions = {
    onToggleFavorite: (p) => void toggleFavorite(p),
    onDuplicate: (p) => void duplicatePage(p),
    onTrash: (p) => void trashPage(p),
  }

  const addPage = async (parentId: string | undefined) => {
    if (!parentId) return
    const id = crypto.randomUUID()
    try {
      await flushOpenEditor()
      await send([{ op: 'create', id, type: 'page', parentId }])
      expand([parentId])
      open(id)
    } catch (err) {
      toast.error(`Couldn't add a page: ${errorMessage(err)}`)
    }
  }

  const movePage = async (draggedId: string, drop: SidebarDrop) => {
    const placement = resolveSidebarDrop(draggedId, drop, rows, pages)
    if (!placement) return
    try {
      await flushOpenEditor()
      let siblings: string[] | undefined
      if (placement.kind === 'beside') {
        siblings = knownChildIds(placement.parentId, pages)
        if (!siblings) {
          // The parent is a block: its children come with the page holding it.
          const holder = pages.find(
            (p) => p.id === placement.anchorId,
          )?.parentPageId
          if (!holder) return
          const opened = await fetchItem(holder)
          siblings = opened.items.find(
            (i) => i.id === placement.parentId,
          )?.childIds
        }
      }
      const op = placementToMove(draggedId, placement, siblings)
      if (!op) return
      await send([op])
      if (placement.kind === 'onto') expand([placement.pageId])
    } catch (err) {
      toast.error(`Couldn't move the page: ${errorMessage(err)}`)
    }
  }

  return { open, actions, addPage, movePage }
}
