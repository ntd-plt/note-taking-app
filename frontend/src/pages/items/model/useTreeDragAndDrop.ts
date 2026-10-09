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
import { useMoveItems } from '#/widgets/note-editor/hooks/useItems'
import type { Item } from '#/shared/models'
import {
  buildChildrenMap,
  getInvalidDropTargetIds,
  getSubtreeIds,
  getTopLevelMembers,
  isNoopMove,
} from '#/shared/lib/hierarchy'
import { ROOT_DROP_ID, resolveDropTarget } from './treeDnd'

interface Options {
  items: Item[]
  selectedIds: ReadonlySet<string>
  /** Called when a drag starts on a row outside the selection: only that row is dragged. */
  onSelectOnly: (ids: string[]) => void
  /** Called as soon as a valid drop happens, so the destination can be expanded. */
  onDropInto: (destinationId: string | null) => void
  onDropped: () => void
}

/**
 * Drag-and-drop behaviour for the sidebar tree: which rows travel, where a drop lands,
 * which folders are off limits, and the move request itself.
 */
export function useTreeDragAndDrop({
  items,
  selectedIds,
  onSelectOnly,
  onDropInto,
  onDropped,
}: Options) {
  const moveItems = useMoveItems()
  const [dragged, setDragged] = React.useState<string[]>([])
  const [overId, setOverId] = React.useState<string | null>(null)

  const sensors = useSensors(
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
    () => getInvalidDropTargetIds(dragged, items),
    [dragged, items],
  )

  const draggingIds = React.useMemo(
    () => getSubtreeIds(dragged, buildChildrenMap(items)),
    [dragged, items],
  )

  // The destination under the pointer, or undefined when it is missing or not allowed.
  const resolveValid = React.useCallback(
    (id: string | null) => {
      const target = resolveDropTarget(id, items)
      if (!target) return undefined
      if (
        target.destinationId !== null &&
        invalidTargetIds.has(target.destinationId)
      ) {
        return undefined
      }
      return target
    },
    [items, invalidTargetIds],
  )

  const hovered = dragged.length > 0 ? resolveValid(overId) : undefined

  const reset = () => {
    setDragged([])
    setOverId(null)
  }

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (!items.some((i) => i.id === id)) return
    let travelling = selectedIds
    if (!selectedIds.has(id)) {
      onSelectOnly([id])
      travelling = getSubtreeIds([id], buildChildrenMap(items))
    }
    setDragged(getTopLevelMembers(travelling, items).map((i) => i.id))
  }

  const onDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const moved = dragged
    const target = resolveValid(event.over ? String(event.over.id) : null)
    reset()
    if (!target || moved.length === 0) return
    onDropInto(target.destinationId)
    if (isNoopMove(moved, target.destinationId, items)) return
    moveItems.mutate({ itemIds: moved, destinationId: target.destinationId })
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
    draggingIds,
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
