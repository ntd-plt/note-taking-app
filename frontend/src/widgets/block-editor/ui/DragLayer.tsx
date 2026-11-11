// Dragging blocks by their ⋮⋮ handle, replacing BlockNote's own drag and drop.
// While a drag runs, every pointer move measures the visible blocks, asks
// dropTarget where the block would land and draws the indicator. On release the
// block is moved in the editor keeping its id, so the next save sends one move.
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLatest } from '#/shared/hooks/useLatest'
import { dropTarget } from '../model/dropTarget'
import { appendChild } from '../model/editorOps'
import type { BlockRow, DropGeometry, EditorDrop } from '../model/dropTarget'
import type { PageEditor } from '../model/schema'

const DEFAULT_INDENT = 24
const SCROLL_ZONE = 48
const SCROLL_STEP = 14

interface Layout extends DropGeometry {
  outers: Map<string, HTMLElement>
  right: number
}

// The block's own line: .bn-block-outer[data-id] > .bn-block > .bn-block-content,
// or one level deeper for blocks rendered by React (such as the page block),
// which BlockNote wraps in a .react-renderer. Nested blocks sit in a
// .bn-block-group next to the content.
const OWN_CONTENT =
  ':scope > .bn-block > .bn-block-content, :scope > .bn-block > .react-renderer > .bn-block-content'

// measure reads each visible block's own line (not its children) from the DOM.
export function measure(root: HTMLElement): Layout {
  const rows: BlockRow[] = []
  const outers = new Map<string, HTMLElement>()
  let originX = Infinity
  let right = 0
  for (const outer of root.querySelectorAll<HTMLElement>('.bn-block-outer')) {
    const id = outer.dataset.id
    const content = outer.querySelector<HTMLElement>(OWN_CONTENT)
    if (!id || !content) continue
    const rect = content.getBoundingClientRect()
    if (rect.height === 0) continue // inside a collapsed toggle
    let depth = 0
    let parentId: string | null = null
    for (
      let up = outer.parentElement?.closest<HTMLElement>('.bn-block-outer');
      up && root.contains(up);
      up = up.parentElement?.closest<HTMLElement>('.bn-block-outer')
    ) {
      if (depth === 0) parentId = up.dataset.id ?? null
      depth++
    }
    rows.push({
      id,
      parentId,
      depth,
      top: rect.top,
      bottom: rect.bottom,
      isPage: content.dataset.contentType === 'page',
    })
    outers.set(id, outer)
    right = Math.max(right, rect.right)
    if (depth === 0) originX = Math.min(originX, rect.left)
  }
  if (!Number.isFinite(originX)) originX = root.getBoundingClientRect().left
  const nested = rows.find((r) => r.depth > 0)
  const nestedLeft = nested
    ? outers.get(nested.id)!.querySelector(OWN_CONTENT)!.getBoundingClientRect()
        .left
    : undefined
  const indent =
    nested && nestedLeft !== undefined && nestedLeft > originX
      ? (nestedLeft - originX) / nested.depth
      : DEFAULT_INDENT
  return { rows, indent, originX, outers, right }
}

// applyDrop moves the dragged block in the editor, as one undo step.
export function applyDrop(
  editor: PageEditor,
  draggedId: string,
  drop: EditorDrop,
) {
  const dragged = editor.getBlock(draggedId)
  if (!dragged || drop.kind === 'page') return
  editor.transact(() => {
    editor.removeBlocks([draggedId])
    if (drop.kind === 'nest') {
      appendChild(editor, drop.targetId, dragged)
    } else if (drop.afterId) {
      editor.insertBlocks([dragged], drop.afterId, 'after')
    } else if (drop.parentId) {
      const parent = editor.getBlock(drop.parentId)
      const first = parent?.children[0]
      if (first) editor.insertBlocks([dragged], first, 'before')
      else editor.updateBlock(drop.parentId, { children: [dragged] })
    } else {
      const first = editor.document[0] as typeof dragged | undefined
      if (first) editor.insertBlocks([dragged], first, 'before')
      else editor.replaceBlocks(editor.document, [dragged])
    }
  })
}

interface DragState {
  id: string
  drop: EditorDrop | null
  layout: Layout
}

export interface BlockDrag {
  start: (blockId: string, pointer: { x: number; y: number }) => void
  overlay: React.ReactNode
}

export function useBlockDrag(
  editor: PageEditor,
  onDrop: (draggedId: string, drop: EditorDrop) => void,
  onActiveChange?: (active: boolean) => void,
): BlockDrag {
  const [state, setState] = React.useState<DragState | null>(null)
  const onDropRef = useLatest(onDrop)
  const onActiveRef = useLatest(onActiveChange)

  const start = React.useCallback(
    (id: string, first: { x: number; y: number }) => {
      const root = editor.domElement
      if (!root) return
      let pointer = first
      let current: DragState | null = null
      let frame = 0
      const update = () => {
        const layout = measure(root)
        current = { id, layout, drop: dropTarget(id, pointer, layout) }
        setState(current)
      }
      const scroller = scrollParent(root)
      const tick = () => {
        const box = scroller.getBoundingClientRect()
        const top = Math.max(box.top, 0)
        const bottom = Math.min(box.bottom, window.innerHeight)
        let dy = 0
        if (pointer.y < top + SCROLL_ZONE) dy = -SCROLL_STEP
        else if (pointer.y > bottom - SCROLL_ZONE) dy = SCROLL_STEP
        if (dy !== 0) {
          scroller.scrollBy(0, dy)
          update()
        }
        frame = requestAnimationFrame(tick)
      }
      const move = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY }
        update()
      }
      const stop = () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('keydown', key, true)
        document.body.style.removeProperty('cursor')
        setState(null)
        onActiveRef.current?.(false)
      }
      const up = () => {
        const done = current
        stop()
        if (done?.drop) onDropRef.current(done.id, done.drop)
      }
      const key = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        stop()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('keydown', key, true)
      document.body.style.cursor = 'grabbing'
      onActiveRef.current?.(true)
      update()
      frame = requestAnimationFrame(tick)
    },
    [editor, onDropRef, onActiveRef],
  )

  return { start, overlay: state ? <Indicator state={state} /> : null }
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return document.scrollingElement as HTMLElement
}

function Indicator({ state }: { state: DragState }) {
  const { drop, layout } = state
  const dragged = layout.outers.get(state.id)?.getBoundingClientRect()
  const parts: React.ReactNode[] = []
  if (dragged) {
    parts.push(
      <div
        key="dragged"
        className="pointer-events-none fixed rounded-sm bg-primary/5"
        style={box(dragged)}
      />,
    )
  }
  if (drop) {
    const row = (id: string) => layout.rows.find((r) => r.id === id)
    const highlight =
      drop.kind === 'gap'
        ? drop.parentId
        : drop.kind === 'nest'
          ? drop.targetId
          : drop.pageId
    const outer = highlight ? layout.outers.get(highlight) : undefined
    if (outer) {
      parts.push(
        <div
          key="target"
          data-drop-highlight={highlight}
          className="pointer-events-none fixed rounded-md bg-primary/10 ring-1 ring-primary/40"
          style={box(outer.getBoundingClientRect())}
        />,
      )
    }
    let line: { y: number; level: number } | undefined
    if (drop.kind === 'gap') {
      const below = drop.lineBelowId ? row(drop.lineBelowId) : undefined
      line = {
        y: below ? below.bottom : (layout.rows[0]?.top ?? 0),
        level: drop.level,
      }
    } else if (drop.kind === 'nest') {
      const target = row(drop.targetId)
      const lastBelow = lastVisibleDescendant(layout.rows, drop.targetId)
      if (target)
        line = {
          y: lastBelow?.bottom ?? target.bottom,
          level: target.depth + 1,
        }
    }
    if (line) {
      const left = layout.originX + line.level * layout.indent
      parts.push(
        <div
          key="line"
          data-drop-line=""
          className="pointer-events-none fixed h-[3px] rounded-full bg-primary"
          style={{
            top: line.y - 1.5,
            left,
            width: Math.max(layout.right - left, 24),
          }}
        />,
      )
    }
  }
  return createPortal(<div className="z-50">{parts}</div>, document.body)
}

const box = (r: DOMRect): React.CSSProperties => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
})

function lastVisibleDescendant(rows: BlockRow[], id: string) {
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return undefined
  let last: BlockRow | undefined
  for (let j = i + 1; j < rows.length && rows[j].depth > rows[i].depth; j++)
    last = rows[j]
  return last
}
