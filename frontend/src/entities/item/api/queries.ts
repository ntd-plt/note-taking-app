import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Op } from '../model/types'
import { applyOps, duplicateItem, fetchItem, fetchPages } from './itemApi'

export const itemKeys = {
  item: (id: string) => ['item', id] as const,
  pages: ['pages'] as const,
}

export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: itemKeys.item(id ?? ''),
    queryFn: () => fetchItem(id!),
    enabled: !!id,
  })
}

export function usePages() {
  return useQuery({ queryKey: itemKeys.pages, queryFn: fetchPages })
}

// changesPages reports whether a batch can change the sidebar without the caller
// knowing item types: creating a page, trashing one, or deleting a block (pages
// inside it go to the trash). Moves and updates of pages must say so themselves.
export const changesPages = (ops: Op[]) =>
  ops.some(
    (op) =>
      op.op === 'trash' ||
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
        return queryClient.invalidateQueries({ queryKey: itemKeys.pages })
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
