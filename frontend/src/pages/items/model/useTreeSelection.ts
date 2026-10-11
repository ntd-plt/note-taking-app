import * as React from 'react'
import type { Item } from '#/shared/models'
import {
  buildChildrenMap,
  buildParentMap,
  getAncestorIds,
  getSubtreeIds,
} from '#/shared/lib/hierarchy'
import { rangeBetween } from './treeDnd'

export function useTreeSelection(items: Item[], visible: string[]) {
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const anchor = React.useRef<string | null>(null)

  const childrenMap = React.useMemo(() => buildChildrenMap(items), [items])
  const parentMap = React.useMemo(() => buildParentMap(items), [items])

  const clear = React.useCallback(() => {
    setSelectedIds(new Set())
    anchor.current = null
  }, [])

  const toggle = React.useCallback(
    (id: string) => {
      anchor.current = id
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (prev.has(id)) {
          for (const gone of getSubtreeIds([id], childrenMap)) next.delete(gone)
          for (const ancestor of getAncestorIds(id, parentMap)) {
            next.delete(ancestor)
          }
        } else {
          for (const added of getSubtreeIds([id], childrenMap)) next.add(added)
        }
        return next
      })
    },
    [childrenMap, parentMap],
  )

  const replaceWith = React.useCallback(
    (ids: string[]) => {
      setSelectedIds(getSubtreeIds(ids, childrenMap))
      anchor.current = ids[ids.length - 1] ?? null
    },
    [childrenMap],
  )

  const extendTo = React.useCallback(
    (id: string) => {
      const from = anchor.current ?? id
      setSelectedIds(
        getSubtreeIds(rangeBetween(visible, from, id), childrenMap),
      )
      if (!anchor.current) anchor.current = id
    },
    [visible, childrenMap],
  )

  // Escape clears the selection.
  React.useEffect(() => {
    if (selectedIds.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedIds.size, clear])

  React.useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => parentMap.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [parentMap])

  const onRowClick = React.useCallback(
    (id: string, e: React.MouseEvent, open: () => void) => {
      if (e.metaKey || e.ctrlKey) {
        toggle(id)
      } else if (e.shiftKey) {
        extendTo(id)
      } else {
        clear()
        open()
      }
    },
    [toggle, extendTo, clear],
  )

  return { selectedIds, clear, replaceWith, onRowClick }
}
