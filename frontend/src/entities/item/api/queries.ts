import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Op } from '../model/types'
import {
  applyOps,
  deleteFromTrash,
  duplicateItem,
  emptyTrash,
  fetchItem,
  fetchPages,
  fetchTrash,
  fetchWorkspace,
  restoreFromTrash,
} from './itemApi'

export const itemKeys = {
  item: (id: string) => ['item', id] as const,
  items: ['item'] as const,
  pages: ['pages'] as const,
  workspace: ['workspace'] as const,
  trash: ['trash'] as const,
}

// The editor loads an item once and then owns it: a refetch remounts the editor,
// so it happens only when asked for (after a failed save, or a change made
// outside the editor), never on focus or remount. The editor marks the item
// stale after each save, so opening it again later loads it fresh.
export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: itemKeys.item(id ?? ''),
    queryFn: () => fetchItem(id!),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

// The workspace id never changes, so it is fetched once.
export function useWorkspace() {
  return useQuery({
    queryKey: itemKeys.workspace,
    queryFn: fetchWorkspace,
    staleTime: Infinity,
  })
}

export function usePages() {
  return useQuery({ queryKey: itemKeys.pages, queryFn: fetchPages })
}

export function useTrash() {
  return useQuery({ queryKey: itemKeys.trash, queryFn: fetchTrash })
}

// useTrashAction wraps a trash endpoint: afterwards the trash and the sidebar
// are refetched, and so is any open page, which may have held a restored page.
function useTrashAction<T>(fn: (arg: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: itemKeys.trash }),
        queryClient.invalidateQueries({ queryKey: itemKeys.pages }),
        queryClient.invalidateQueries({ queryKey: itemKeys.items }),
      ]),
  })
}

export const useRestoreFromTrash = () => useTrashAction(restoreFromTrash)
export const useDeleteFromTrash = () => useTrashAction(deleteFromTrash)
export const useEmptyTrash = () => useTrashAction((_: void) => emptyTrash())

// changesPages reports whether a batch can change the sidebar without the caller
// knowing item types: creating a page, trashing one, or deleting a block (pages
// inside it go to the trash). Moves and updates of pages must say so themselves.
export const changesPages = (ops: Op[]) =>
  ops.some(
    (op) =>
      op.op === 'trash' ||
      op.op === 'restore' ||
      op.op === 'delete' ||
      (op.op === 'create' && op.type === 'page'),
  )

export interface ApplyOpsInput {
  ops: Op[]
  // Refetch /pages afterwards. Defaults to changesPages(ops).
  refreshPages?: boolean
}

export function useApplyOps() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ops }: ApplyOpsInput) => applyOps(ops),
    onSuccess: (_data, { ops, refreshPages }) => {
      if (refreshPages ?? changesPages(ops)) {
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: itemKeys.pages }),
          queryClient.invalidateQueries({ queryKey: itemKeys.trash }),
        ])
      }
    },
  })
}

export function useDuplicateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: duplicateItem,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: itemKeys.pages }),
  })
}
