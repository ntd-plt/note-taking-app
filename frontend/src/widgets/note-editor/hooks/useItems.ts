import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Item, ItemType, NoteContent } from '#/shared/models'
import { DEFAULT_ICONS } from '#/shared/models'
import type { CreateItemInput, ItemPatch } from '#/shared/api'
import { debounce } from '#/shared/lib/debounce'
import { buildChildrenMap, getSubtreeIds } from '#/shared/lib/hierarchy'
import { useItemsStore } from './useItemsStore'
import * as React from 'react'
import * as api from '../api'

export const ITEMS_KEY = ['items'] as const
export const contentKey = (id: string) => ['item-content', id] as const

// Queries

export function useItemsQuery() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: () => api.fetchItems(),
  })
}

export function useNoteContentQuery(id: string | null | undefined) {
  return useQuery({
    queryKey: contentKey(id ?? ''),
    queryFn: () => api.fetchNoteContent(id!),
    enabled: !!id,
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()
  const setSavingItemId = useItemsStore((state) => state.setSavingItemId)

  const mutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ItemPatch }) =>
      api.updateItem(id, updates),
    onSuccess: (saved) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old || []).map((i) =>
          i.id === saved.id ? { ...i, updatedAt: saved.updatedAt } : i,
        ),
      )
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })

  // Ref keeps debounced functions stable across renders
  const debouncedRenamesRef = React.useRef<
    Record<string, ReturnType<typeof debounce>>
  >({})

  const applyOptimistically = React.useCallback(
    (id: string, updates: ItemPatch) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old || []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      )
    },
    [queryClient],
  )

  const updateItemNow = React.useCallback(
    (id: string, updates: ItemPatch) => {
      applyOptimistically(id, updates)
      mutation.mutate({ id, updates })
    },
    [applyOptimistically, mutation],
  )

  const updateItem = React.useCallback(
    (id: string, updates: ItemPatch) => {
      if (updates.name === undefined) {
        updateItemNow(id, updates)
        return
      }
      applyOptimistically(id, updates)
      setSavingItemId(id)

      if (!(id in debouncedRenamesRef.current)) {
        debouncedRenamesRef.current[id] = debounce(async () => {
          try {
            const current = queryClient
              .getQueryData<Item[]>(ITEMS_KEY)
              ?.find((i) => i.id === id)
            const name = current?.name.trim()
            if (name) {
              await mutation.mutateAsync({ id, updates: { name } })
            }
          } catch (err) {
            console.error('Failed to save item name:', err)
          } finally {
            if (useItemsStore.getState().savingItemId === id) {
              setSavingItemId(null)
            }
          }
        }, 1000) // 1-second debounce
      }
      debouncedRenamesRef.current[id]()
    },
    [
      applyOptimistically,
      mutation,
      queryClient,
      setSavingItemId,
      updateItemNow,
    ],
  )

  return { updateItem, updateItemNow, isSaving: mutation.isPending }
}

export function useSaveNoteContent() {
  const queryClient = useQueryClient()
  const setSavingItemId = useItemsStore((state) => state.setSavingItemId)

  const mutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.saveNoteContent(id, content),
    onSuccess: (saved) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old || []).map((i) =>
          i.id === saved.itemId ? { ...i, updatedAt: saved.updatedAt } : i,
        ),
      )
    },
  })

  const debouncedSavesRef = React.useRef<
    Record<string, ReturnType<typeof debounce>>
  >({})

  const saveContent = React.useCallback(
    (id: string, content: string) => {
      // 1. Optimistic update in cache instantly (snappy UI)
      queryClient.setQueryData<NoteContent>(contentKey(id), (old) => ({
        itemId: id,
        content,
        updatedAt: old?.updatedAt,
      }))

      setSavingItemId(id)
      if (!(id in debouncedSavesRef.current)) {
        debouncedSavesRef.current[id] = debounce(async () => {
          try {
            const latest = queryClient.getQueryData<NoteContent>(contentKey(id))
            if (latest) {
              await mutation.mutateAsync({ id, content: latest.content })
            }
          } catch (err) {
            console.error('Failed to autosave note:', err)
          } finally {
            if (useItemsStore.getState().savingItemId === id) {
              setSavingItemId(null)
            }
          }
        }, 1000) // 1-second debounce
      }
      debouncedSavesRef.current[id]()
    },
    [queryClient, mutation, setSavingItemId],
  )

  return { saveContent, isSaving: mutation.isPending }
}

export type NewItem = Partial<Omit<CreateItemInput, 'type'>> & {
  type: ItemType
  activate?: boolean
}

function creationDefaults(input: NewItem) {
  const name =
    input.name?.trim() ||
    (input.type === 'folder' ? 'Untitled Folder' : 'Untitled Note')
  const escapedName = name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return {
    type: input.type,
    name,
    parentId: input.parentId || null,
    icon: input.icon || DEFAULT_ICONS[input.type],
    isFavorite: input.isFavorite ?? false,
    content:
      input.type === 'note'
        ? (input.content ??
          `<h1>${escapedName}</h1><p>Start writing here...</p>`)
        : undefined,
  }
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  const setActiveItemId = useItemsStore((state) => state.setActiveItemId)

  const mutation = useMutation({
    mutationFn: (input: NewItem & { id: string }) =>
      api.createItem({ ...creationDefaults(input), id: input.id }),
    onMutate: async (input) => {
      const defaults = creationDefaults(input)
      const optimistic: Item = {
        id: input.id,
        type: defaults.type,
        name: defaults.name,
        parentId: defaults.parentId,
        icon: defaults.icon,
        isFavorite: defaults.isFavorite,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previousActiveItemId = useItemsStore.getState().activeItemId
      if (defaults.type === 'note') {
        queryClient.setQueryData<NoteContent>(contentKey(input.id), {
          itemId: input.id,
          content: defaults.content ?? '',
        })
      }
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) => [
        ...(old || []),
        optimistic,
      ])
      if (defaults.type === 'note' && input.activate !== false) {
        setActiveItemId(input.id)
      }

      return { previousActiveItemId }
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) => {
        if (!old) return [created]
        return old.map((i) => (i.id === created.id ? created : i))
      })
    },
    onError: (_error, input, context) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old || []).filter((i) => i.id !== input.id),
      )
      queryClient.removeQueries({ queryKey: contentKey(input.id) })
      if (context && useItemsStore.getState().activeItemId === input.id) {
        const items = queryClient.getQueryData<Item[]>(ITEMS_KEY) || []
        setActiveItemId(
          items.some((i) => i.id === context.previousActiveItemId)
            ? context.previousActiveItemId
            : null,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })

  const withId = (input: NewItem) => ({
    ...input,
    id: input.id ?? crypto.randomUUID(),
  })

  return {
    ...mutation,
    mutate: (input: NewItem, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate(withId(input), options),
    mutateAsync: (
      input: NewItem,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) => mutation.mutateAsync(withId(input), options),
  }
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  const setActiveItemId = useItemsStore((state) => state.setActiveItemId)

  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previousItems = queryClient.getQueryData<Item[]>(ITEMS_KEY)

      const doomed = getSubtreeIds([id], buildChildrenMap(previousItems || []))
      const remaining = (previousItems || []).filter((i) => !doomed.has(i.id))
      queryClient.setQueryData<Item[]>(ITEMS_KEY, remaining)

      const activeItemId = useItemsStore.getState().activeItemId
      if (activeItemId && doomed.has(activeItemId)) {
        setActiveItemId(remaining.find((i) => i.type === 'note')?.id ?? null)
      }
      for (const doomedId of doomed) {
        queryClient.removeQueries({ queryKey: contentKey(doomedId) })
      }

      return { previousItems }
    },
    onError: (_err, _id, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(ITEMS_KEY, context.previousItems)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })
}

export function useDuplicateItem() {
  const queryClient = useQueryClient()
  const setActiveItemId = useItemsStore((state) => state.setActiveItemId)

  return useMutation({
    mutationFn: (id: string) => api.duplicateItem(id),
    onSuccess: (copy) => {
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) => {
        const items = old || []
        return items.some((i) => i.id === copy.id) ? items : [...items, copy]
      })
      if (copy.type === 'note') {
        setActiveItemId(copy.id)
      } else {
        queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
      }
    },
  })
}

export function useMoveItems() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      itemIds,
      destinationId,
    }: {
      itemIds: string[]
      destinationId: string | null
    }) => api.moveItems(itemIds.map((id) => ({ id, parentId: destinationId }))),
    onMutate: async ({ itemIds, destinationId }) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previousItems = queryClient.getQueryData<Item[]>(ITEMS_KEY)

      if (previousItems) {
        const moving = new Set(itemIds)
        queryClient.setQueryData<Item[]>(
          ITEMS_KEY,
          previousItems.map((i) =>
            moving.has(i.id) ? { ...i, parentId: destinationId } : i,
          ),
        )
      }

      return { previousItems }
    },
    onSuccess: (moved) => {
      const movedById = new Map(moved.map((i) => [i.id, i]))
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        old?.map((i) => movedById.get(i.id) ?? i),
      )
    },
    // On failure, restore the tree and resync with the server in case it moved on.
    onError: (err, _vars, context) => {
      console.error('Failed to move items:', err)
      if (context?.previousItems) {
        queryClient.setQueryData(ITEMS_KEY, context.previousItems)
      }
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })
}
