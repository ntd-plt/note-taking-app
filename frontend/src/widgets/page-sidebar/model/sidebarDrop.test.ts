import { describe, expect, it } from 'vitest'
import { pageName } from '#/entities/item'
import type { Item } from '#/entities/item'
import { seedTree } from '#/entities/item/api/mockSeed'
import {
  fromWireItem,
  fromWireOpenedItem,
  toWireOp,
} from '#/entities/item/api/wire'
import { buildPageTree, visibleRows } from './pageTree'
import {
  knownChildIds,
  placementToMove,
  pointerToDrop,
  resolveSidebarDrop,
} from './sidebarDrop'
import type { SidebarDrop } from './sidebarDrop'

// The seeded workspace with every page expanded. Visible rows:
//   0 Getting Started
//   1   How this app works   (inside a toggle block)
//   2 Work
//   3   Website Redesign
//   4     Design checklist
//   5   Weekly sync          (inside the "Meetings" bullet)
//   6 Personal
//   7   Reading list
//   8 Ideas inbox
function setup() {
  const { tree, ids } = seedTree()
  const pages = () => tree.listPages().map(fromWireItem)
  const rows = () => {
    const all = pages()
    return visibleRows(buildPageTree(all), new Set(all.map((p) => p.id)))
  }
  // Drops a page the way the sidebar will: resolve, find the siblings (fetching
  // the containing page when the parent is a block), build the op, send it.
  const drop = (name: string, target: SidebarDrop) => {
    const all = pages()
    const placement = resolveSidebarDrop(ids[name], target, rows(), all)
    if (!placement) return null
    let siblings: string[] | undefined
    if (placement.kind === 'beside') {
      siblings = knownChildIds(placement.parentId, all)
      if (!siblings) {
        const opened = fromWireOpenedItem(tree.open(placement.parentId))
        siblings = opened.items.find(
          (i) => i.id === placement.parentId,
        )?.childIds
      }
    }
    const op = placementToMove(ids[name], placement, siblings)
    if (op) tree.apply([toWireOp(op)])
    return op
  }
  const parentOf = (name: string): Item | undefined => {
    const all = pages()
    const me = all.find((p) => p.id === ids[name])!
    return all.find((p) => p.id === me.parentPageId)
  }
  const order = () => pages().map(pageName)
  return { tree, ids, drop, pages, parentOf, order }
}

describe('sidebar drop rules', () => {
  it('puts a page dropped onto another page at the end of its content', () => {
    const s = setup()
    expect(
      s.drop('Ideas inbox', { kind: 'onto', pageId: s.ids.Personal }),
    ).toEqual({
      op: 'move',
      id: s.ids['Ideas inbox'],
      parentId: s.ids.Personal,
    })
    expect(s.parentOf('Ideas inbox')?.id).toBe(s.ids.Personal)
    expect(s.order().slice(-3)).toEqual([
      'Personal',
      'Reading list',
      'Ideas inbox',
    ])
    // The page lands before the trailing empty paragraph.
    const personal = s.pages().find((p) => p.id === s.ids.Personal)!
    expect(personal.childIds.at(-2)).toBe(s.ids['Ideas inbox'])
  })

  it('puts a page dropped between pages right after the previous one', () => {
    const s = setup()
    s.drop('Ideas inbox', { kind: 'gap', index: 5 })
    expect(s.parentOf('Ideas inbox')?.id).toBe(s.ids['Website Redesign'])
    expect(s.order().indexOf('Ideas inbox')).toBe(
      s.order().indexOf('Design checklist') + 1,
    )
  })

  it('follows the previous page into the block that holds it', () => {
    const s = setup()
    const weekly = s.pages().find((p) => p.id === s.ids['Weekly sync'])!
    s.drop('Ideas inbox', { kind: 'gap', index: 6 })
    const ideas = s.pages().find((p) => p.id === s.ids['Ideas inbox'])!
    expect(ideas.parentId).toBe(weekly.parentId)
    expect(s.order().indexOf('Ideas inbox')).toBe(
      s.order().indexOf('Weekly sync') + 1,
    )
  })

  it('puts a page dropped first in a group before the next page', () => {
    const s = setup()
    s.drop('Ideas inbox', { kind: 'gap', index: 3 })
    expect(s.parentOf('Ideas inbox')?.id).toBe(s.ids.Work)
    expect(s.order().slice(2, 5)).toEqual([
      'Work',
      'Ideas inbox',
      'Website Redesign',
    ])
  })

  it('puts a page dropped at the very top first in the workspace', () => {
    const s = setup()
    s.drop('Ideas inbox', { kind: 'gap', index: 0 })
    expect(s.order()[0]).toBe('Ideas inbox')
    expect(s.parentOf('Ideas inbox')).toBeUndefined()
  })

  it('puts a page dropped below every row after the last row', () => {
    const s = setup()
    s.drop('Getting Started', { kind: 'gap', index: 9 })
    // It takes its own child page along.
    expect(s.order().slice(-2)).toEqual([
      'Getting Started',
      'How this app works',
    ])
  })

  it('refuses drops into the page itself or below it', () => {
    const s = setup()
    expect(s.drop('Work', { kind: 'onto', pageId: s.ids.Work })).toBeNull()
    expect(
      s.drop('Work', { kind: 'onto', pageId: s.ids['Design checklist'] }),
    ).toBeNull()
    expect(s.drop('Work', { kind: 'gap', index: 5 })).toBeNull()
    expect(s.drop('Work', { kind: 'gap', index: 4 })).toBeNull()
  })

  it('does nothing when the page would not move', () => {
    const s = setup()
    // First in Personal's group is before Reading list, which is the page itself.
    expect(s.drop('Reading list', { kind: 'gap', index: 7 })).toBeNull()
    // Right after Work at the top level, where Personal already is.
    expect(
      placementToMove(
        s.ids.Personal,
        {
          kind: 'beside',
          parentId: s.pages()[0].parentId!,
          anchorId: s.ids.Work,
          side: 'after',
        },
        knownChildIds(s.pages()[0].parentId!, s.pages()),
      ),
    ).toBeNull()
  })

  it('needs the siblings for a placement beside a page', () => {
    const s = setup()
    expect(() =>
      placementToMove(s.ids.Work, {
        kind: 'beside',
        parentId: 'x',
        anchorId: s.ids.Personal,
        side: 'after',
      }),
    ).toThrow()
  })
})

describe('knownChildIds', () => {
  it('knows the children of a listed page and of the workspace', () => {
    const s = setup()
    const all = s.pages()
    const work = all.find((p) => p.id === s.ids.Work)!
    expect(knownChildIds(work.id, all)).toBe(work.childIds)
    expect(knownChildIds(all[0].parentId!, all)).toEqual(
      all.filter((p) => p.parentPageId === null).map((p) => p.id),
    )
  })

  it('does not know the children of a block', () => {
    const s = setup()
    const weekly = s.pages().find((p) => p.id === s.ids['Weekly sync'])!
    expect(knownChildIds(weekly.parentId!, s.pages())).toBeUndefined()
  })
})

describe('pointerToDrop', () => {
  const rows = [
    { id: 'a', top: 0, bottom: 40 },
    { id: 'b', top: 40, bottom: 80 },
  ]

  it('drops onto the middle of a row and between rows at its edges', () => {
    expect(pointerToDrop(rows, 20)).toEqual({ kind: 'onto', pageId: 'a' })
    expect(pointerToDrop(rows, 5)).toEqual({ kind: 'gap', index: 0 })
    expect(pointerToDrop(rows, 35)).toEqual({ kind: 'gap', index: 1 })
    expect(pointerToDrop(rows, 45)).toEqual({ kind: 'gap', index: 1 })
    expect(pointerToDrop(rows, 79)).toEqual({ kind: 'gap', index: 2 })
  })

  it('drops above the first and below the last row', () => {
    expect(pointerToDrop(rows, -10)).toEqual({ kind: 'gap', index: 0 })
    expect(pointerToDrop(rows, 500)).toEqual({ kind: 'gap', index: 2 })
    expect(pointerToDrop([], 0)).toBeNull()
  })
})
