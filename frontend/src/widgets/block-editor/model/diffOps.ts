// diffOps builds the POST /ops batch that turns the last saved snapshot into the
// current one, in this order:
//   1. creates and moves, in document order, so a parent always exists (and sits
//      where it ends up) before anything is put into it;
//   2. updates, carrying only the props keys that changed;
//   3. trash for removed child pages;
//   4. delete for the top-most removed blocks (the server deletes what is under
//      them and trashes any page still inside).
//
// Positions are worked out by replaying the creates and moves on a copy of the
// old child lists, since the server counts a position against the list as it
// stands when the op runs. Removed blocks are still in those lists at that point,
// so every block is placed right after its previous sibling, never by its final
// index. In each parent, the longest run of children that kept their relative
// order stays put and only the others move: dragging one block yields one move.
import type { Op, Props } from '#/entities/item'
import { childList, documentOrder } from './blocks'
import type { Snapshot } from './blocks'

export function diffOps(prev: Snapshot, next: Snapshot): Op[] {
  const placed: Op[] = []
  const work = new Map<string, string[]>()
  const listOf = (parentId: string) => {
    let list = work.get(parentId)
    if (!list) {
      list = [...childList(prev, parentId)]
      work.set(parentId, list)
    }
    return list
  }

  const visit = (parentId: string) => {
    const target = childList(next, parentId)
    const stay = keptInOrder(target, childList(prev, parentId))
    target.forEach((id, i) => {
      const node = next.nodes.get(id)!
      const old = prev.nodes.get(id)
      if (!stay.has(id)) {
        if (old) {
          const from = listOf(old.parentId)
          from.splice(from.indexOf(id), 1)
        }
        const list = listOf(parentId)
        const position = i === 0 ? 0 : list.indexOf(target[i - 1]) + 1
        list.splice(position, 0, id)
        placed.push(
          old
            ? { op: 'move', id, parentId, position }
            : {
                op: 'create',
                id,
                type: node.type,
                parentId,
                position,
                props: node.props,
              },
        )
      }
      if (node.type !== 'page') visit(id)
    })
  }
  visit(next.pageId)

  const updates: Op[] = []
  for (const id of documentOrder(next)) {
    const node = next.nodes.get(id)!
    const old = prev.nodes.get(id)
    // A child page is renamed on the page itself, never through this document.
    if (!old || node.type === 'page' || old.type === 'page') continue
    const props = changedProps(old.props, node.props)
    const typeChanged = node.type !== old.type
    if (!typeChanged && !props) continue
    updates.push({
      op: 'update',
      id,
      ...(typeChanged && { type: node.type }),
      ...(props && { props }),
    })
  }

  const trashed: Op[] = []
  const deleted: Op[] = []
  for (const id of documentOrder(prev)) {
    if (next.nodes.has(id)) continue
    const old = prev.nodes.get(id)!
    if (old.type === 'page') trashed.push({ op: 'trash', id })
    else if (old.parentId === prev.pageId || next.nodes.has(old.parentId))
      deleted.push({ op: 'delete', id })
  }

  return [...placed, ...updates, ...trashed, ...deleted]
}

// keptInOrder picks the children that need no op: those that were already
// children of the same parent, forming the longest run whose old order is kept.
function keptInOrder(target: string[], before: string[]): Set<string> {
  const oldIndex = new Map(before.map((id, i) => [id, i]))
  const candidates = target.filter((id) => oldIndex.has(id))
  return new Set(longestIncreasing(candidates, (id) => oldIndex.get(id)!))
}

// longestIncreasing returns a longest subsequence of xs whose keys increase,
// in O(n log n).
function longestIncreasing<T>(xs: T[], key: (x: T) => number): T[] {
  const tails: number[] = [] // index into xs of the smallest tail per length
  const back: number[] = new Array(xs.length).fill(-1)
  xs.forEach((x, i) => {
    const k = key(x)
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (key(xs[tails[mid]]) < k) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) back[i] = tails[lo - 1]
    tails[lo] = i
  })
  const out: T[] = []
  for (let i = tails.at(-1) ?? -1; i !== -1; i = back[i]) out.push(xs[i])
  return out.reverse()
}

// changedProps returns the keys of b whose values differ from a, or undefined.
// A key that disappeared is not sent: the server never removes props keys.
function changedProps(a: Props, b: Props): Props | undefined {
  const out: Props = {}
  let any = false
  for (const [k, v] of Object.entries(b)) {
    if (sameJSON(a[k], v)) continue
    out[k] = v
    any = true
  }
  return any ? out : undefined
}

function sameJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    sameJSON(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  )
}
