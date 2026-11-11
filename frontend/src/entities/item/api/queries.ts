import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
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

// What a tree change does to open items: 'reload' refetches them, which
// remounts the editor; 'stale' only marks them, for the editor's own saves;
// 'keep' leaves them alone, for changes the editor never shows.
export type EditorRefresh = 'reload' | 'stale' | 'keep'

// invalidateTree refetches the sidebar and the trash after a change to the tree.
export async function invalidateTree(
  queryClient: QueryClient,
  { editor = 'reload' }: { editor?: EditorRefresh } = {},
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: itemKeys.pages }),
    queryClient.invalidateQueries({ queryKey: itemKeys.trash }),
    editor !== 'keep' &&
      queryClient.invalidateQueries({
        queryKey: itemKeys.items,
        refetchType: editor === 'stale' ? 'none' : 'active',
      }),
  ])
}

// useTrashAction wraps a trash endpoint. Any open page is reloaded, as it may
// have held a restored page.
function useTrashAction<T>(fn: (arg: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidateTree(queryClient),
  })
}

export const useRestoreFromTrash = () => useTrashAction(restoreFromTrash)
export const useDeleteFromTrash = () => useTrashAction(deleteFromTrash)
export const useEmptyTrash = () => useTrashAction((_: void) => emptyTrash())

export interface ApplyOpsInput {
  ops: Op[]
  editor?: EditorRefresh
}

export function useApplyOps() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ops }: ApplyOpsInput) => applyOps(ops),
    onSuccess: (_data, { editor }) => invalidateTree(queryClient, { editor }),
  })
}

export function useDuplicateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: duplicateItem,
    onSuccess: () => invalidateTree(queryClient),
  })
}
