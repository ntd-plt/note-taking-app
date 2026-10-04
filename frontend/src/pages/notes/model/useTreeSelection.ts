import * as React from 'react'
import type { ItemRef } from '#/shared/lib/hierarchy'
import { itemKey, rangeBetween, sameItem } from './treeDnd'

/**
 * Multi-selection over the visible tree rows. `visible` must be in on-screen order so
 * Shift-click can select a range.
 */
export function useTreeSelection(visible: ItemRef[]) {
  const [selection, setSelection] = React.useState<ItemRef[]>([])
  const anchor = React.useRef<ItemRef | null>(null)

  const clear = React.useCallback(() => {
    setSelection([])
    anchor.current = null
  }, [])

  const toggle = React.useCallback((ref: ItemRef) => {
    anchor.current = ref
    setSelection((prev) =>
      prev.some((i) => sameItem(i, ref))
        ? prev.filter((i) => !sameItem(i, ref))
        : [...prev, ref],
    )
  }, [])

  const extendTo = React.useCallback(
    (ref: ItemRef) => {
      const from = anchor.current ?? ref
      setSelection(rangeBetween(visible, from, ref))
      if (!anchor.current) anchor.current = ref
    },
    [visible],
  )

  const replaceWith = React.useCallback((refs: ItemRef[]) => {
    setSelection(refs)
    anchor.current = refs[refs.length - 1] ?? null
  }, [])

  // Escape clears the selection.
  React.useEffect(() => {
    if (selection.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selection.length, clear])

  // Drop selected rows that no longer exist or are no longer visible (e.g. a folder collapsed).
  React.useEffect(() => {
    const visibleKeys = new Set(visible.map(itemKey))
    setSelection((prev) => {
      const next = prev.filter((i) => visibleKeys.has(itemKey(i)))
      return next.length === prev.length ? prev : next
    })
  }, [visible])

  const onRowClick = React.useCallback(
    (ref: ItemRef, e: React.MouseEvent, open: () => void) => {
      if (e.metaKey || e.ctrlKey) {
        toggle(ref)
      } else if (e.shiftKey) {
        extendTo(ref)
      } else {
        clear()
        open()
      }
    },
    [toggle, extendTo, clear],
  )

  return { selection, clear, replaceWith, onRowClick }
}
