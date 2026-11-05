import { describe, expect, it } from 'vitest'
import { dropTarget } from './dropTarget'
import type { BlockRow } from './dropTarget'

// Rows are 30 px tall, one after another from y = 100; each level indents 24 px
// from x = 0. The document:
//   a
//     a1
//     a2
//       a2x
//   b (child page)
//   c
const H = 30
const spec: [string, string | null, number, boolean?][] = [
  ['a', null, 0],
  ['a1', 'a', 1],
  ['a2', 'a', 1],
  ['a2x', 'a2', 2],
  ['b', null, 0, true],
  ['c', null, 0],
]
const rows: BlockRow[] = spec.map(([id, parentId, depth, isPage], i) => ({
  id,
  parentId,
  depth,
  top: 100 + i * H,
  bottom: 100 + (i + 1) * H,
  isPage: isPage ?? false,
}))
const geo = { rows, indent: 24, originX: 0 }
const row = (id: string) => rows.find((r) => r.id === id)!
const mid = (id: string) => (row(id).top + row(id).bottom) / 2
const bottomEdge = (id: string) => row(id).bottom - 2
const topEdge = (id: string) => row(id).top + 2
const atLevel = (level: number) => level * 24 + 5

describe('dropTarget', () => {
  it('nests into the middle of a block, as its last child', () => {
    expect(dropTarget('c', { x: 300, y: mid('a1') }, geo)).toEqual({
      kind: 'nest',
      targetId: 'a1',
    })
  })

  it('moves to the end of a child page dropped in its middle', () => {
    expect(dropTarget('c', { x: 0, y: mid('b') }, geo)).toEqual({
      kind: 'page',
      pageId: 'b',
    })
  })

  it('shows nothing over the dragged block or its descendants', () => {
    expect(dropTarget('a2', { x: 0, y: mid('a2') }, geo)).toBeNull()
    expect(dropTarget('a', { x: 0, y: mid('a2x') }, geo)).toBeNull()
  })

  it('treats the top edge of a block as the gap below the block above', () => {
    expect(dropTarget('c', { x: atLevel(1), y: topEdge('a2') }, geo)).toEqual(
      dropTarget('c', { x: atLevel(1), y: bottomEdge('a1') }, geo),
    )
  })

  it('drops above the first block into the gap below the title', () => {
    const want = {
      kind: 'gap',
      parentId: null,
      afterId: null,
      level: 0,
      lineBelowId: null,
    }
    expect(dropTarget('c', { x: 200, y: topEdge('a') }, geo)).toEqual(want)
    expect(dropTarget('c', { x: 200, y: 20 }, geo)).toEqual(want)
  })

  it('places a block right after a sibling, not at the end of the parent', () => {
    expect(
      dropTarget('c', { x: atLevel(1), y: bottomEdge('a1') }, geo),
    ).toEqual({
      kind: 'gap',
      parentId: 'a',
      afterId: 'a1',
      level: 1,
      lineBelowId: 'a1',
    })
  })

  it('nests as the first child one level in', () => {
    expect(
      dropTarget('c', { x: atLevel(2), y: bottomEdge('a1') }, geo),
    ).toEqual({
      kind: 'gap',
      parentId: 'a1',
      afterId: null,
      level: 2,
      lineBelowId: 'a1',
    })
  })

  it('offers only the first-child level between a block and its first child', () => {
    for (const x of [atLevel(0), atLevel(1), atLevel(5)])
      expect(dropTarget('c', { x, y: bottomEdge('a2') }, geo)).toMatchObject({
        parentId: 'a2',
        afterId: null,
        level: 2,
      })
  })

  it('climbs through ancestors when the block above is a last child', () => {
    const y = bottomEdge('a2x')
    expect(dropTarget('c', { x: atLevel(3), y }, geo)).toMatchObject({
      parentId: 'a2x',
      afterId: null,
    })
    expect(dropTarget('c', { x: atLevel(2), y }, geo)).toMatchObject({
      parentId: 'a2',
      afterId: 'a2x',
    })
    expect(dropTarget('c', { x: atLevel(1), y }, geo)).toMatchObject({
      parentId: 'a',
      afterId: 'a2',
    })
    expect(dropTarget('c', { x: atLevel(0), y }, geo)).toMatchObject({
      parentId: null,
      afterId: 'a',
      lineBelowId: 'a2x',
    })
    // Far left clamps to the outermost level the gap allows.
    expect(dropTarget('c', { x: -100, y }, geo)).toMatchObject({ level: 0 })
  })

  it('never nests into a child page from a gap', () => {
    expect(dropTarget('a', { x: atLevel(4), y: bottomEdge('b') }, geo)).toEqual(
      {
        kind: 'gap',
        parentId: null,
        afterId: 'b',
        level: 0,
        lineBelowId: 'b',
      },
    )
  })

  it('drops below the last block, at any level up to the top', () => {
    expect(dropTarget('a', { x: atLevel(0), y: 1000 }, geo)).toMatchObject({
      parentId: null,
      afterId: 'c',
    })
    expect(dropTarget('a', { x: atLevel(1), y: 1000 }, geo)).toMatchObject({
      parentId: 'c',
      afterId: null,
    })
  })

  it('shows nothing for a gap inside the dragged block', () => {
    expect(
      dropTarget('a', { x: atLevel(2), y: bottomEdge('a1') }, geo),
    ).toBeNull()
  })

  it('shows nothing where the block already is', () => {
    // Right below itself, and right below its previous sibling.
    expect(
      dropTarget('a2', { x: atLevel(1), y: bottomEdge('a2x') }, geo),
    ).toBeNull()
    expect(
      dropTarget('a2', { x: atLevel(1), y: bottomEdge('a1') }, geo),
    ).toBeNull()
    expect(dropTarget('a', { x: 0, y: topEdge('a') }, geo)).toBeNull()
  })

  it('lets a last child climb out from below itself', () => {
    expect(
      dropTarget('a2x', { x: atLevel(0), y: bottomEdge('a2x') }, geo),
    ).toMatchObject({ parentId: null, afterId: 'a' })
  })

  it('treats the space between two rows as the gap between them', () => {
    const spaced = { ...geo, rows: [rows[0], { ...rows[4], top: 200 }] }
    expect(dropTarget('c', { x: 0, y: 160 }, spaced)).toMatchObject({
      kind: 'gap',
      afterId: 'a',
    })
  })
})
