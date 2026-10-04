import * as React from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { useMoveItems } from '#/widgets/note-editor/hooks/useNotesQuery'
import type { Folder, Note } from '#/widgets/note-editor/model'
import { getInvalidDropTargetIds, isNoopMove } from '#/shared/lib/hierarchy'
import type { ItemRef } from '#/shared/lib/hierarchy'
import { ROOT_DROP_ID, resolveDropTarget, sameItem } from './treeDnd'

interface Options {
  folders: Folder[]
  notes: Note[]
  /** The current multi-selection. */
  selection: ItemRef[]
  /** Called when a drag starts on a row outside the selection: only that row is dragged. */
  onSelectOnly: (refs: ItemRef[]) => void
  /** Called as soon as a valid drop happens, so the destination can be expanded. */
  onDropInto: (destinationId: string | null) => void
  /** Called after a valid drop so the selection can be cleared (clones get new ids). */
  onDropped: () => void
}

/**
 * Drag-and-drop behaviour for the sidebar tree: which rows travel, where a drop lands,
 * which folders are off limits, and the move request itself.
 */
export function useTreeDragAndDrop({
  folders,
  notes,
  selection,
  onSelectOnly,
  onDropInto,
  onDropped,
}: Options) {
  const moveItems = useMoveItems()
  const [dragged, setDragged] = React.useState<ItemRef[]>([])
  const [overId, setOverId] = React.useState<string | null>(null)

  const sensors = useSensors(
    // A small distance keeps plain clicks (open note, toggle folder) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // Rows win over the surrounding tree area, which stands for the top level.
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    if (!args.pointerCoordinates) return closestCenter(args)
    const rowHits = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id !== ROOT_DROP_ID,
      ),
    })
    if (rowHits.length > 0) return rowHits
    return pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id === ROOT_DROP_ID,
      ),
    })
  }, [])

  const invalidTargetIds = React.useMemo(
    () => getInvalidDropTargetIds(dragged, folders),
    [dragged, folders],
  )

  // The destination under the pointer, or undefined when it is missing or not allowed.
  const resolveValid = React.useCallback(
    (id: string | null) => {
      const target = resolveDropTarget(id, folders, notes)
      if (!target) return undefined
      if (
        target.destinationId !== null &&
        invalidTargetIds.has(target.destinationId)
      ) {
        return undefined
      }
      return target
    },
    [folders, notes, invalidTargetIds],
  )

  const hovered = dragged.length > 0 ? resolveValid(overId) : undefined

  const reset = () => {
    setDragged([])
    setOverId(null)
  }

  const onDragStart = (event: DragStartEvent) => {
    const ref = event.active.data.current as ItemRef | undefined
    if (!ref) return
    const inSelection = selection.some((i) => sameItem(i, ref))
    if (!inSelection) onSelectOnly([ref])
    setDragged(inSelection ? selection : [ref])
  }

  const onDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const items = dragged
    const target = resolveValid(event.over ? String(event.over.id) : null)
    reset()
    if (!target || items.length === 0) return
    onDropInto(target.destinationId)
    if (isNoopMove(items, target.destinationId, folders, notes)) return
    moveItems.mutate({ items, destinationId: target.destinationId })
    onDropped()
  }

  return {
    sensors,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel: reset,
    dragged,
    invalidTargetIds,
    /** Folder highlighted as the destination, if the drop would land in a folder. */
    dropFolderId: hovered?.destinationId ?? null,
    /** True when the drop would land on the top level. */
    dropOnRoot: hovered !== undefined && hovered.destinationId === null,
    isMoving: moveItems.isPending,
    /** Message of the last failed move, until it is dismissed or another move starts. */
    moveError: moveItems.isError ? moveItems.error.message : null,
    dismissMoveError: moveItems.reset,
  }
}
