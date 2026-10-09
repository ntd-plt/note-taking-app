import { describe, expect, it } from 'vitest'
import type { Item } from '../models'
import {
  buildChildrenMap,
  buildParentMap,
  compareItems,
  getAncestorIds,
  getInvalidDropTargetIds,
  getItemPath,
  getSubtreeIds,
  getTopLevelMembers,
  isNoopMove,
  sortItems,
} from './hierarchy'

const folder = (id: string, parentId: string | null = null): Item => ({
  id,
  type: 'folder',
  name: id,
  parentId,
  icon: '📁',
  isFavorite: false,
})
const note = (id: string, parentId: string | null = null): Item => ({
  id,
  type: 'note',
  name: id,
  parentId,
  icon: '📄',
  isFavorite: false,
})

const items: Item[] = [
  folder('dest'),
  folder('A'),
  folder('B', 'A'),
  note('in-a', 'A'),
  note('deep', 'B'),
  note('loose'),
]

describe('sortItems', () => {
  it('lists folders first, then orders by name', () => {
    const sorted = sortItems([
      note('b'),
      folder('z'),
      note('a'),
      folder('m'),
    ]).map((i) => i.id)
    expect(sorted).toEqual(['m', 'z', 'a', 'b'])
  })

  it('does not change the input array', () => {
    const input = [note('b'), note('a')]
    sortItems(input)
    expect(input.map((i) => i.id)).toEqual(['b', 'a'])
    expect(compareItems(input[0], input[1])).toBeGreaterThan(0)
  })
})

describe('getSubtreeIds', () => {
  it('returns the roots and everything below them', () => {
    const subtree = getSubtreeIds(['A'], buildChildrenMap(items))
    expect([...subtree].sort()).toEqual(['A', 'B', 'deep', 'in-a'])
  })

  it('merges several roots and ignores overlap', () => {
    const subtree = getSubtreeIds(['A', 'B', 'loose'], buildChildrenMap(items))
    expect([...subtree].sort()).toEqual(['A', 'B', 'deep', 'in-a', 'loose'])
  })

  it('terminates on cyclic data', () => {
    const cyclic = [folder('x', 'y'), folder('y', 'x')]
    expect([...getSubtreeIds(['x'], buildChildrenMap(cyclic))].sort()).toEqual([
      'x',
      'y',
    ])
  })
})

describe('getAncestorIds', () => {
  it('lists the folders above an item, nearest first', () => {
    expect(getAncestorIds('deep', buildParentMap(items))).toEqual(['B', 'A'])
    expect(getAncestorIds('loose', buildParentMap(items))).toEqual([])
  })

  it('terminates on cyclic data', () => {
    const cyclic = [folder('x', 'y'), folder('y', 'x')]
    expect(getAncestorIds('x', buildParentMap(cyclic))).toEqual(['y'])
  })
})

describe('getTopLevelMembers', () => {
  const ids = (selected: string[]) =>
    getTopLevelMembers(new Set(selected), items).map((i) => i.id)

  it('keeps only the selected items whose parent is not selected', () => {
    expect(ids(['A', 'B', 'deep', 'in-a', 'loose'])).toEqual(['A', 'loose'])
  })

  it('promotes the rest of a folder once the folder itself is deselected', () => {
    expect(ids(['B', 'deep', 'in-a'])).toEqual(['B', 'in-a'])
  })

  it('returns a lone nested item', () => {
    expect(ids(['deep'])).toEqual(['deep'])
  })

  it('returns nothing for an empty selection', () => {
    expect(ids([])).toEqual([])
  })
})

describe('getInvalidDropTargetIds', () => {
  it('covers moved folders and all their descendants', () => {
    expect([...getInvalidDropTargetIds(['A'], items)].sort()).toEqual([
      'A',
      'B',
      'deep',
      'in-a',
    ])
  })

  it('ignores moved notes', () => {
    expect(getInvalidDropTargetIds(['loose', 'in-a'], items).size).toBe(0)
  })

  it('terminates on cyclic folder data', () => {
    const cyclic = [folder('x', 'y'), folder('y', 'x')]
    expect([...getInvalidDropTargetIds(['x'], cyclic)].sort()).toEqual([
      'x',
      'y',
    ])
  })
})

describe('isNoopMove', () => {
  it('is a no-op when everything already lives in the destination', () => {
    expect(isNoopMove(['B', 'in-a'], 'A', items)).toBe(true)
    expect(isNoopMove(['dest', 'loose'], null, items)).toBe(true)
  })

  it('is not a no-op when any item would change parent', () => {
    expect(isNoopMove(['B', 'loose'], 'A', items)).toBe(false)
    expect(isNoopMove(['loose'], 'dest', items)).toBe(false)
  })
})

describe('getItemPath', () => {
  it('lists the folders above an item from the top level down', () => {
    const deep = items.find((i) => i.id === 'deep')!
    expect(getItemPath(deep, items).map((i) => i.id)).toEqual(['A', 'B'])
  })

  it('is empty for a top-level item', () => {
    expect(getItemPath(items[5], items)).toEqual([])
  })

  it('stops at a missing parent and on a cycle', () => {
    const orphan = note('orphan', 'gone')
    expect(getItemPath(orphan, [orphan])).toEqual([])
    const cyclic = [folder('x', 'y'), folder('y', 'x')]
    expect(getItemPath(cyclic[0], cyclic).map((i) => i.id)).toEqual(['y'])
  })
})
