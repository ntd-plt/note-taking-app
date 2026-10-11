import { afterEach, describe, expect, it } from 'vitest'
import * as api from '#/widgets/note-editor/api'
import { nextCloneName, resetMockItems } from './items.handlers'

afterEach(() => resetMockItems())

describe('mock items API', () => {
  it('rejects the same bad requests as the server', async () => {
    const note = await api.createItem({ type: 'note', name: 'N' })
    await expect(
      api.createItem({ type: 'note', name: 'X', parentId: note.id }),
    ).rejects.toThrow('parent must be a folder')
    await expect(
      api.createItem({ type: 'note', name: 'X', parentId: 'missing' }),
    ).rejects.toThrow('parent folder not found')
    await expect(api.createItem({ type: 'note', name: '  ' })).rejects.toThrow(
      'name is required',
    )
    await expect(api.fetchItem('missing')).rejects.toThrow('item not found')
  })

  it('gives content only to notes', async () => {
    const folder = await api.createItem({ type: 'folder', name: 'F' })
    await expect(api.fetchNoteContent(folder.id)).rejects.toThrow(
      'item is not a note',
    )
    await expect(api.saveNoteContent(folder.id, 'x')).rejects.toThrow(
      'item is not a note',
    )
  })

  it('moves atomically: a bad entry leaves every item where it was', async () => {
    const a = await api.createItem({ type: 'folder', name: 'A' })
    const b = await api.createItem({ type: 'note', name: 'B' })
    await expect(
      api.moveItems([
        { id: b.id, parentId: a.id },
        { id: a.id, parentId: b.id },
      ]),
    ).rejects.toThrow('destination must be a folder')
    expect((await api.fetchItem(b.id)).parentId).toBeNull()
  })

  it('refuses a cycle formed by two moves in one request', async () => {
    const a = await api.createItem({ type: 'folder', name: 'A' })
    const b = await api.createItem({ type: 'folder', name: 'B' })
    await expect(
      api.moveItems([
        { id: a.id, parentId: b.id },
        { id: b.id, parentId: a.id },
      ]),
    ).rejects.toThrow(/itself or one of its descendants/)
  })

  it('deletes a folder with its whole subtree and their content', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    const n = await api.createItem({ type: 'note', name: 'N', parentId: f.id })
    await api.deleteItem(f.id)
    await expect(api.fetchItem(n.id)).rejects.toThrow()
    await expect(api.fetchNoteContent(n.id)).rejects.toThrow()
  })

  it('lists folders first, then by name, without note content', async () => {
    const items = await api.fetchItems()
    const firstNote = items.findIndex((i) => i.type === 'note')
    expect(items.slice(0, firstNote).every((i) => i.type === 'folder')).toBe(
      true,
    )
    expect(items.slice(firstNote).every((i) => i.type === 'note')).toBe(true)
    expect(items[0]).not.toHaveProperty('content')
  })
})

describe('nextCloneName', () => {
  it('takes the smallest unused number', () => {
    const taken = new Set(['Plan', 'Plan (Copy 1)', 'Plan (Copy 3)'])
    expect(nextCloneName('Plan', taken)).toBe('Plan (Copy 2)')
    expect(taken.has('Plan (Copy 2)')).toBe(true)
  })

  it('replaces an existing suffix instead of stacking', () => {
    expect(nextCloneName('Plan (Copy 4)', new Set(['Plan (Copy 4)']))).toBe(
      'Plan (Copy 1)',
    )
  })

  it('truncates the base so the name fits 255 characters', () => {
    const name = nextCloneName('é'.repeat(255), new Set())
    expect([...name]).toHaveLength(255)
    expect(name.endsWith(' (Copy 1)')).toBe(true)
  })
})
