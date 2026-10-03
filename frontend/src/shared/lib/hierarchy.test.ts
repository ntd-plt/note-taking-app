import { describe, expect, it } from 'vitest'
import type { Folder, Note } from '../models'
import {
  getInvalidDropTargetIds,
  isNoopMove,
  nextCloneName,
  splitSelection,
} from './hierarchy'
import type { ItemRef } from './hierarchy'

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
const f = (id: string): ItemRef => ({ id, type: 'folder' })
const n = (id: string): ItemRef => ({ id, type: 'note' })

// root
// ├── A
// │   ├── B (folder)
// │   │   └── note-deep
// │   └── note-in-a
// └── D
const folders = [folder('A'), folder('B', 'A'), folder('D')]
const notes = [note('note-in-a', 'A'), note('note-deep', 'B'), note('loose')]

describe('splitSelection', () => {
  it('moves items that have no selected ancestor', () => {
    const split = splitSelection([f('A'), n('loose')], folders, notes)
    expect(split.moved).toEqual([f('A'), n('loose')])
    expect(split.cloned).toEqual([])
  })

  it('clones items inside another selected folder, at any depth', () => {
    const split = splitSelection(
      [f('A'), f('B'), n('note-in-a'), n('note-deep')],
      folders,
      notes,
    )
    expect(split.moved).toEqual([f('A')])
    expect(split.cloned).toEqual([f('B'), n('note-in-a'), n('note-deep')])
  })

  it('moves a nested item on its own when its parent is not selected', () => {
    const split = splitSelection([n('note-deep')], folders, notes)
    expect(split.moved).toEqual([n('note-deep')])
  })

  it('ignores duplicate entries', () => {
    expect(
      splitSelection([n('loose'), n('loose')], folders, notes).moved,
    ).toHaveLength(1)
  })

  it('terminates on cyclic folder data', () => {
    const cyclic = [folder('X', 'Y'), folder('Y', 'X')]
    expect(() => splitSelection([f('X')], cyclic, [])).not.toThrow()
  })
})

describe('getInvalidDropTargetIds', () => {
  it('covers selected folders and all their descendants', () => {
    const invalid = getInvalidDropTargetIds([f('A')], folders)
    expect([...invalid].sort()).toEqual(['A', 'B'])
  })

  it('leaves unrelated folders and the ancestors of a selection valid', () => {
    const invalid = getInvalidDropTargetIds([f('B')], folders)
    expect(invalid.has('A')).toBe(false)
    expect(invalid.has('D')).toBe(false)
  })

  it('does not treat selected notes as invalid targets', () => {
    expect(getInvalidDropTargetIds([n('loose')], folders).size).toBe(0)
  })
})

describe('isNoopMove', () => {
  it('is a no-op when everything already lives in the destination', () => {
    expect(isNoopMove([n('note-in-a'), f('B')], 'A', folders, notes)).toBe(true)
    expect(isNoopMove([n('loose'), f('D')], null, folders, notes)).toBe(true)
  })

  it('is not a no-op when something changes parent', () => {
    expect(isNoopMove([n('loose')], 'A', folders, notes)).toBe(false)
  })

  it('is never a no-op when a clone would be created', () => {
    expect(isNoopMove([f('A'), n('note-in-a')], null, folders, notes)).toBe(
      false,
    )
  })
})

describe('nextCloneName', () => {
  it('takes the smallest unused number', () => {
    const taken = new Set(['Report (Copy 1)', 'Report (Copy 3)'])
    expect(nextCloneName('Report', taken)).toBe('Report (Copy 2)')
    expect(nextCloneName('Report', taken)).toBe('Report (Copy 4)')
  })

  it('replaces an existing suffix instead of stacking', () => {
    expect(nextCloneName('Report (Copy 1)', new Set())).toBe('Report (Copy 1)')
    expect(nextCloneName('Report (Copy 7)', new Set(['Report (Copy 1)']))).toBe(
      'Report (Copy 2)',
    )
  })

  it('truncates the base so the name fits 255 characters', () => {
    const name = nextCloneName('é'.repeat(255), new Set())
    expect([...name]).toHaveLength(255)
    expect(name.endsWith(' (Copy 1)')).toBe(true)
  })
})
