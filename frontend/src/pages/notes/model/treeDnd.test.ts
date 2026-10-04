import { describe, expect, it } from 'vitest'
import type { Folder, Note, SidebarItem } from '#/widgets/note-editor/model'
import {
  ROOT_DROP_ID,
  flattenVisible,
  rangeBetween,
  resolveDropTarget,
} from './treeDnd'

const folder = (id: string, parentId: string | null = null): Folder => ({
  id,
  name: id,
  parentId,
})
const note = (id: string, parentId: string | null = null): Note => ({
  id,
  title: id,
  content: '',
  parentId,
})

const folderItem = (
  id: string,
  isExpanded: boolean,
  children: SidebarItem[],
): SidebarItem => ({
  type: 'folder',
  id,
  data: { ...folder(id), isExpanded },
  children,
})
const noteItem = (id: string): SidebarItem => ({
  type: 'note',
  id,
  data: note(id),
})

describe('flattenVisible', () => {
  it('lists rows in on-screen order and skips children of collapsed folders', () => {
    const tree = [
      folderItem('open', true, [
        noteItem('inside'),
        folderItem('shut', false, [noteItem('hidden')]),
      ]),
      noteItem('loose'),
    ]
    expect(flattenVisible(tree).map((i) => i.id)).toEqual([
      'open',
      'inside',
      'shut',
      'loose',
    ])
  })
})

describe('rangeBetween', () => {
  const visible = ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    type: 'note' as const,
  }))

  it('returns the inclusive range in either direction', () => {
    expect(
      rangeBetween(visible, visible[1], visible[3]).map((i) => i.id),
    ).toEqual(['b', 'c', 'd'])
    expect(
      rangeBetween(visible, visible[3], visible[1]).map((i) => i.id),
    ).toEqual(['b', 'c', 'd'])
  })

  it('falls back to the clicked row when the anchor is not visible', () => {
    const gone = { id: 'zzz', type: 'note' as const }
    expect(rangeBetween(visible, gone, visible[2])).toEqual([visible[2]])
  })
})

describe('resolveDropTarget', () => {
  const folders = [folder('f'), folder('inner', 'f')]
  const notes = [note('in-f', 'f'), note('top')]

  it('treats the tree area as the top level', () => {
    expect(resolveDropTarget(ROOT_DROP_ID, folders, notes)).toEqual({
      destinationId: null,
    })
  })

  it('uses a folder as its own destination', () => {
    expect(resolveDropTarget('inner', folders, notes)).toEqual({
      destinationId: 'inner',
    })
  })

  it('uses the parent folder when hovering a note', () => {
    expect(resolveDropTarget('in-f', folders, notes)).toEqual({
      destinationId: 'f',
    })
    expect(resolveDropTarget('top', folders, notes)).toEqual({
      destinationId: null,
    })
  })

  it('returns nothing for unknown or missing targets', () => {
    expect(resolveDropTarget('nope', folders, notes)).toBeUndefined()
    expect(resolveDropTarget(null, folders, notes)).toBeUndefined()
  })
})
