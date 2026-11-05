import { describe, expect, it } from 'vitest'
import type { Op } from '#/entities/item'
import { MockTree } from '#/entities/item/api/mockTree'
import { fromWireOpenedItem, toWireOp } from '#/entities/item/api/wire'
import { fromBlockNote, toBlockNote } from './blocks'
import type { BNBlock, Snapshot } from './blocks'
import { diffOps } from './diffOps'

const text = (t: string) =>
  t === '' ? [] : [{ type: 'text', text: t, styles: {} }]
const p = (id: string, t = id, children: BNBlock[] = []): BNBlock => ({
  id,
  type: 'paragraph',
  props: {},
  content: text(t),
  children,
})
const page = (id: string): BNBlock => ({
  id,
  type: 'page',
  props: { name: id, icon: '📄' },
  children: [],
})
const snap = (doc: BNBlock[]) => fromBlockNote('page', doc)

// A document as nested ids and props, for comparing two snapshots.
interface Shape {
  id: string
  type: string
  props: unknown
  children: Shape[]
}
function shape(s: Snapshot, ids = s.rootIds): Shape[] {
  return ids.map((id) => {
    const n = s.nodes.get(id)!
    return { id, type: n.type, props: n.props, children: shape(s, n.childIds) }
  })
}

// A mock server holding one page, so diffs can be checked by applying them.
function server(doc: BNBlock[]) {
  const tree = new MockTree()
  tree.apply([
    {
      op: 'create',
      id: 'page',
      type: 'page',
      parent_id: tree.workspaceId,
      props: { name: 'Doc' },
    },
  ])
  const initial = snap(doc)
  tree.apply(diffOps(snap([]), initial).map(toWireOp))
  const read = () =>
    fromBlockNote('page', toBlockNote(fromWireOpenedItem(tree.open('page'))))
  expect(shape(read())).toEqual(shape(initial))
  return { tree, read }
}

describe('diffOps', () => {
  const base = () => [p('a'), p('b', 'b', [p('b1')]), p('c')]

  it('returns nothing when nothing changed', () => {
    expect(diffOps(snap(base()), snap(base()))).toEqual([])
  })

  it('sends only the changed props of an edited block', () => {
    const next = base()
    next[0] = { ...next[0], props: { textColor: 'red' }, content: text('A!') }
    expect(diffOps(snap(base()), snap(next))).toEqual([
      {
        op: 'update',
        id: 'a',
        props: { textColor: 'red', content: text('A!') },
      },
    ])
  })

  it('sends the new type and its props for a turn-into', () => {
    const next = base()
    next[2] = { ...next[2], type: 'heading', props: { level: 2 } }
    expect(diffOps(snap(base()), snap(next))).toEqual([
      { op: 'update', id: 'c', type: 'heading', props: { level: 2 } },
    ])
  })

  it('creates an inserted block at its index, with its children after it', () => {
    const next = base()
    next.splice(1, 0, p('n', 'new', [p('n1')]))
    expect(diffOps(snap(base()), snap(next))).toEqual([
      {
        op: 'create',
        id: 'n',
        type: 'paragraph',
        parentId: 'page',
        position: 1,
        props: { content: text('new') },
      },
      {
        op: 'create',
        id: 'n1',
        type: 'paragraph',
        parentId: 'n',
        position: 0,
        props: { content: text('n1') },
      },
    ])
  })

  it('moves only the dragged block when one block goes to the end', () => {
    const [a, b, c] = base()
    expect(diffOps(snap(base()), snap([b, c, a]))).toEqual([
      { op: 'move', id: 'a', parentId: 'page', position: 2 },
    ])
  })

  it('moves only the dragged block when one block goes to the top', () => {
    const [a, b, c] = base()
    expect(diffOps(snap(base()), snap([c, a, b]))).toEqual([
      { op: 'move', id: 'c', parentId: 'page', position: 0 },
    ])
  })

  it('nests a block under the one above it', () => {
    const [a, b, c] = base()
    expect(diffOps(snap(base()), snap([{ ...a, children: [b] }, c]))).toEqual([
      { op: 'move', id: 'b', parentId: 'a', position: 0 },
    ])
  })

  it('trashes a removed child page and deletes only the top-most removed block', () => {
    const prev = [p('a', 'a', [p('a1', 'a1', [page('child')])]), p('z')]
    expect(diffOps(snap(prev), snap([p('z')]))).toEqual([
      { op: 'trash', id: 'child' },
      { op: 'delete', id: 'a' },
    ])
  })

  it('orders creates and moves, then updates, then trash, then deletes', () => {
    const prev = [p('a'), page('pg'), p('b'), p('c')]
    const next = [p('c'), p('a', 'edited'), p('n')]
    const kinds = diffOps(snap(prev), snap(next)).map((o) => o.op)
    expect(kinds).toEqual(['move', 'create', 'update', 'trash', 'delete'])
  })

  it('places blocks right even with removed siblings still in the list', () => {
    const prev = [p('a'), p('x'), p('b')]
    const next = [p('a'), p('b'), p('n')]
    const s = server(prev)
    s.tree.apply(diffOps(snap(prev), snap(next)).map(toWireOp))
    expect(shape(s.read())).toEqual(shape(snap(next)))
  })

  it('swaps a parent and its child without a cycle', () => {
    const prev = [p('a', 'a', [p('b', 'b', [p('c')])])]
    const next = [p('b', 'b', [p('a', 'a', [p('c')])])]
    const s = server(prev)
    s.tree.apply(diffOps(snap(prev), snap(next)).map(toWireOp))
    expect(shape(s.read())).toEqual(shape(snap(next)))
  })
})

// Random edits, checked by applying the diff to the mock server and reading the
// page back: the result must be exactly the edited document.
describe('diffOps on random edits', () => {
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
  }

  type Slot = { list: BNBlock[]; index: number }

  function allBlocks(doc: BNBlock[]): Slot[] {
    const out: Slot[] = []
    const walk = (list: BNBlock[]) =>
      list.forEach((b, index) => {
        out.push({ list, index })
        walk(b.children)
      })
    walk(doc)
    return out
  }

  // Lists a block may go into, never inside `except` or a page block.
  function lists(doc: BNBlock[], except?: BNBlock): BNBlock[][] {
    const out: BNBlock[][] = [doc]
    const walk = (list: BNBlock[]) =>
      list.forEach((b) => {
        if (b === except || b.type === 'page') return
        out.push(b.children)
        walk(b.children)
      })
    walk(doc)
    return out
  }

  function edit(doc: BNBlock[], rand: () => number, n: number) {
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
    const fresh = () => `n${n}-${Math.floor(rand() * 1e9)}`
    const blocks = allBlocks(doc)
    const r = rand()
    if (blocks.length === 0 || r < 0.3) {
      const list = pick(lists(doc))
      const b = rand() < 0.2 ? page(fresh()) : p(fresh())
      list.splice(Math.floor(rand() * (list.length + 1)), 0, b)
    } else if (r < 0.5) {
      const s = pick(blocks)
      s.list.splice(s.index, 1)
    } else if (r < 0.8) {
      const s = pick(blocks)
      const [b] = s.list.splice(s.index, 1)
      const list = pick(lists(doc, b))
      list.splice(Math.floor(rand() * (list.length + 1)), 0, b)
    } else {
      const s = pick(blocks)
      const b = s.list[s.index]
      if (b.type === 'page') return
      s.list[s.index] =
        rand() < 0.5
          ? { ...b, content: text(`edit ${n}`) }
          : { ...b, type: 'bulletListItem' }
    }
  }

  const clone = (doc: BNBlock[]): BNBlock[] =>
    doc.map((b) => ({ ...b, children: clone(b.children) }))

  it('always turns the old document into the new one', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = rng(seed)
      const doc: BNBlock[] = []
      for (let i = 0; i < 12; i++) edit(doc, rand, i)
      const s = server(doc)
      let prev = snap(doc)
      let cur = doc
      for (let round = 0; round < 3; round++) {
        cur = clone(cur)
        const edits = 1 + Math.floor(rand() * 5)
        for (let i = 0; i < edits; i++) edit(cur, rand, 100 * round + i)
        const next = snap(cur)
        const ops: Op[] = diffOps(prev, next)
        s.tree.apply(ops.map(toWireOp))
        expect(shape(s.read()), `seed ${seed} round ${round}`).toEqual(
          shape(next),
        )
        prev = next
      }
    }
  })
})
