import { describe, expect, it } from 'vitest'
import type { Item, SidebarItem } from '#/widgets/note-editor/model'
import {
  ROOT_DROP_ID,
  flattenVisible,
  rangeBetween,
  resolveDropTarget,
} from './treeDnd'

const item = (
  id: string,
  type: Item['type'],
  parentId: string | null = null,
): Item => ({
  id,
  type,
  name: id,
  parentId,
  icon: '',
  isFavorite: false,
})

const row = (
  data: Item,
  isExpanded = false,
  children: SidebarItem[] = [],
): SidebarItem => ({
  id: data.id,
  type: data.type,
  data,
  isExpanded,
  children,
})

describe('flattenVisible', () => {
  it('lists rows in on-screen order and skips collapsed folders', () => {
    const tree = [
      row(item('A', 'folder'), true, [
        row(item('B', 'folder', 'A'), false, [
          row(item('hidden', 'note', 'B')),
        ]),
        row(item('in-a', 'note', 'A')),
      ]),
      row(item('loose', 'note')),
    ]
    expect(flattenVisible(tree)).toEqual(['A', 'B', 'in-a', 'loose'])
  })
})

describe('rangeBetween', () => {
  const visible = ['a', 'b', 'c', 'd']

  it('returns the rows between two ids, inclusive, in either direction', () => {
    expect(rangeBetween(visible, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(visible, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('falls back to the target alone when an end is not visible', () => {
    expect(rangeBetween(visible, 'gone', 'c')).toEqual(['c'])
    expect(rangeBetween(visible, 'a', 'gone')).toEqual(['gone'])
  })
})

describe('resolveDropTarget', () => {
  const items = [
    item('f', 'folder'),
    item('inside', 'note', 'f'),
    item('loose', 'note'),
  ]

  it('uses a folder as its own destination', () => {
    expect(resolveDropTarget('f', items)).toEqual({ destinationId: 'f' })
  })

  it("uses a note's parent folder, or the top level for a top-level note", () => {
    expect(resolveDropTarget('inside', items)).toEqual({ destinationId: 'f' })
    expect(resolveDropTarget('loose', items)).toEqual({ destinationId: null })
  })

  it('treats the tree area as the top level', () => {
    expect(resolveDropTarget(ROOT_DROP_ID, items)).toEqual({
      destinationId: null,
    })
  })

  it('has no target when nothing droppable is under the pointer', () => {
    expect(resolveDropTarget(null, items)).toBeUndefined()
    expect(resolveDropTarget('unknown', items)).toBeUndefined()
  })
})
